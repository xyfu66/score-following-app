import React, { useState, useRef, useEffect } from 'react';
import Head from 'next/head';
import FileUpload from '../components/FileUpload';
import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import CustomAudioPlayer from '../components/AudioPlayer';

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

const IndexPage: React.FC = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isFileUploaded, setIsFileUploaded] = useState(false);
  const [anchorPositionIndex, setAnchorPositionIndex] = useState<number>(0);
  const [realTimePosition, setRealTimePosition] = useState<number>(0);
  const osmd = useRef<OpenSheetMusicDisplay | null>(null);
  const cursor = useRef<any>(null);
  const ws = useRef<WebSocket | null>(null);
  const onsetBeats = useRef<number[]>([]);
  const fileId = useRef<string | null>(null);
  const uniqueNotesWRest = useRef<any[]>([]);
  const timeIndexMap = useRef<{ [key: number]: number }>({}); // timeIndexMap: { time: index }

  const logWithTimestamp = (message: string) => {
    const now = new Date();
    const timestamp = now.toISOString();
    console.log(`[${timestamp}] ${message}`);
  };

  const registerNoteFromOsmd = (osmd: OpenSheetMusicDisplay) => {
    if (osmd && osmd.cursor) {
      let iterator = osmd.cursor.Iterator;

      var allNotes = [];
      var allNotesWRest = [];

      while (!iterator.EndReached) {
        const voices = iterator.CurrentVoiceEntries;
        for (var i = 0; i < voices.length; i++) {
          const v = voices[i];
          const notes = v.Notes;
          for (var j = 0; j < notes.length; j++) {
            const note = notes[j];
            if (note != null) {
              allNotesWRest.push({
                note: note.halfTone + 12,
                time: iterator.currentTimeStamp.RealValue * 4,
                length: note.Length.RealValue,
              });
            }
            if (note != null && note.halfTone != 0 && !note.isRest()) {
              allNotes.push({
                note: note.halfTone + 12,
                time: iterator.currentTimeStamp.RealValue * 4,
                length: note.Length.RealValue,
              });
            }
          }
        }

        iterator.moveToNext();
      }

      const uniqueNotesWRestArray: { note: number; time: number; length: number }[] = [];
      const timeIndexMapObj: { [key: number]: number } = {};
      allNotesWRest.forEach((note, index) => {
        if (!timeIndexMapObj.hasOwnProperty(note.time)) {
          uniqueNotesWRestArray.push(note);
          timeIndexMapObj[note.time] = uniqueNotesWRestArray.length - 1;
        }
      });

      uniqueNotesWRest.current = uniqueNotesWRestArray;
      timeIndexMap.current = timeIndexMapObj;
      cursor.current = osmd.cursor;

      logWithTimestamp(`All notes: ${JSON.stringify(allNotes)}`);
      logWithTimestamp(`Unique notes with rests: ${JSON.stringify(uniqueNotesWRest.current)}`);
      logWithTimestamp(`Time index map: ${JSON.stringify(timeIndexMap.current)}`);
    }
  };

  const afterFileUpload = async (uploadedOsmd: OpenSheetMusicDisplay, uploadedCursor: any) => {
    osmd.current = uploadedOsmd;
    cursor.current = uploadedCursor;
    registerNoteFromOsmd(osmd.current);
    setIsFileUploaded(true);

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    if (fileInput && fileInput.files && fileInput.files.length > 0) {
      const file = fileInput.files[0];
      const formData = new FormData();
      formData.append('file', file);

      // Fetch onset positions from the backend
      const response = await fetch(`${backendUrl}/upload`, {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      onsetBeats.current = data.onset_beats;
      fileId.current = data.file_id;
    } else {
      console.error('No file selected');
    }
  };

  const playMusic = async () => {
    console.log('Playing music');
    if (cursor.current && fileId.current) {
      resetStatus();

      const patchResponse = await fetch(`${backendUrl}/align`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ file_id: fileId.current, onset_beats: onsetBeats.current }),
      });

      if (!patchResponse.ok) {
        throw new Error('Failed to send PATCH request');
      }

      const wsUrl = `${backendUrl.replace(/^http/, 'ws')}/ws`;
      ws.current = new WebSocket(wsUrl);
      ws.current.onopen = () => {
        console.log('WebSocket connection opened');
        ws.current?.send(JSON.stringify({ file_id: fileId.current, onset_beats: onsetBeats.current }));
      };
      ws.current.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log('WebSocket message received: ', data);
        setRealTimePosition(data.beat_position);
      };
      ws.current.onclose = () => {
        console.log('WebSocket connection closed');
      };
      ws.current.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    } else {
      console.error('Cursor or file ID is not initialized');
    }

    function resetStatus() {
      cursor.current.reset();
      cursor.current.show();
      setIsPlaying(true);
      setRealTimePosition(0);
      setAnchorPositionIndex(0);
    }
  };

  useEffect(() => {
    console.log(`Real-time position: ${realTimePosition}, Anchor position index: ${anchorPositionIndex}`);
    if (realTimePosition != anchorPositionIndex) {
      // moveToNextOnset();
      moveToTargetBeat(realTimePosition);
      console.log("realTimePosition: ", realTimePosition);
      setAnchorPositionIndex(realTimePosition);
      console.log('Best position updated to:', anchorPositionIndex);
    }
  }, [realTimePosition]);

  const findClosestIndex = (array: number[], target: number) => {
    let closestIndex = array.findLastIndex((value) => value <= target);
    if (closestIndex === -1) {
      closestIndex = 0;
    }
    return closestIndex;
  };

  const moveToTargetBeat = (targetBeat: number) => {
    logWithTimestamp(`Moving to target beat: ${targetBeat}`);
    if (cursor.current && osmd.current) {
      const currentBeat = getCursorCurrentPosition();
      const currentIndex = timeIndexMap.current[currentBeat];
      let targetIndex = timeIndexMap.current[targetBeat];

      if (currentIndex === undefined) {
        logWithTimestamp('Invalid current beat position');
        return;
      }

      if (targetIndex === undefined) {
        const onsetBeats = Object.keys(timeIndexMap.current).map(Number).sort((a, b) => a - b);
        const closestIndex = findClosestIndex(onsetBeats, targetBeat);
        targetIndex = timeIndexMap.current[onsetBeats[closestIndex]];
        logWithTimestamp(`Closest target index found: ${targetIndex}`);
      }

      const steps = targetIndex - currentIndex;
      logWithTimestamp(`Steps to move: ${steps}`);

      if (steps > 0) {
        for (let i = 0; i < steps; i++) {
          cursor.current.next();
        }
      } else if (steps < 0) {
        for (let i = 0; i < Math.abs(steps); i++) {
          cursor.current.previous();
        }
      }

      cursor.current.show();
      logWithTimestamp(`Updated cursor beat position: ${getCursorCurrentPosition()}`);
    } else {
      logWithTimestamp('Cursor or OSMD is not initialized');
    }
  };

  const stopMusic = () => {
    console.log('Stopping music');
    if (cursor.current) {
      cursor.current.hide();
    }
    setIsPlaying(false);
    if (ws.current) {
      ws.current.close();
      ws.current = null;
      console.log('WebSocket connection closed');
    }
  };

  const getCursorCurrentPosition = () => {
    if (cursor.current && cursor.current.Iterator) {
      return cursor.current.Iterator.currentTimeStamp.RealValue * 4;
    }
    return 0;
  };

  return (
    <div>
      <Head>
        <title>Score Following App</title>
      </Head>
      {/* <CustomAudioPlayer audioPath="audio.wav" startScrolling={playMusic}/> */}
      {isFileUploaded && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '10px' }}>
          <button onClick={playMusic} disabled={isPlaying} style={{ padding: '10px 20px', fontSize: '16px' }}>Play</button>
          <button onClick={stopMusic} disabled={!isPlaying} style={{ padding: '10px 20px', fontSize: '16px', marginLeft: '10px' }}>Stop</button>
        </div>
      )}
      <FileUpload onFileUpload={afterFileUpload} />
    </div>
  );
};

export default IndexPage;