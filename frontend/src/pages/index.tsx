import React, { useState, useRef, useEffect } from 'react';
import Head from 'next/head';
import FileUpload from '../components/FileUpload';
import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import CustomAudioPlayer from '../components/AudioPlayer';

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

const IndexPage: React.FC = () => {
  const vfRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isFileUploaded, setIsFileUploaded] = useState(false);
  const [anchorPositionIndex, setAnchorPositionIndex] = useState<number>(0);
  const [realTimePosition, setRealTimePosition] = useState<number>(0);
  const [inputType, setInputType] = useState<'MIDI' | 'Audio'>('MIDI');
  const [audioDevices, setAudioDevices] = useState<string[]>([]); // 오디오 디바이스 목록 상태
  const [selectedDevice, setSelectedDevice] = useState<string>(''); // 선택된 오디오 디바이스 상태
  const osmd = useRef<OpenSheetMusicDisplay | null>(null);
  const cursor = useRef<any>(null);
  const ws = useRef<WebSocket | null>(null);
  const onsetBeats = useRef<number[] | null>([]);
  const fileId = useRef<string | null>(null);
  const uniqueNotesWRest = useRef<any[]>([]);
  const timeIndexMap = useRef<{ [key: number]: number }>({}); // timeIndexMap: { time: index }

  useEffect(() => {
    if (inputType === 'Audio') {
      fetchAudioDevices();
    }
  }, [inputType]);

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

  useEffect(() => {
    if (vfRef.current) {
      osmd.current = new OpenSheetMusicDisplay(vfRef.current);
      console.log('OSMD initialized');
    }
  }, []);


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

  const onFileUpload = async (data: { file_id: string; onset_beats: number[]; file_content: string }) => {
    onsetBeats.current = data.onset_beats;
    fileId.current = data.file_id;
    setIsFileUploaded(true);

    if (vfRef.current) {
      if (!osmd.current) {
        osmd.current = new OpenSheetMusicDisplay(vfRef.current);
      }
      await osmd.current.load(data.file_content);
      osmd.current.render();
      cursor.current = osmd.current.cursor;
      cursor.current.show();
      registerNoteFromOsmd(osmd.current);
    }
  };

  const playMusic = async () => {
    console.log('Playing music');
    if (cursor.current && fileId.current) {
      resetStatus();

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
        logWithTimestamp(`Invalid current beat position. Cursor's current beat: ${currentBeat}`);
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

      if (getCursorCurrentPosition() < 0) {
        cursor.current.reset();
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

    const fetchAudioDevices = async () => {
    try {
      const response = await fetch(`${backendUrl}/audio-devices`);
      const data = await response.json();
      setAudioDevices(data.devices);
      if (data.devices.length > 0) {
        setSelectedDevice(data.devices[0].name);
      }
    } catch (error) {
      console.error('Error fetching audio devices:', error);
    }
  };

  

  return (
    <div>
      <Head>
        <title>Score Following App</title>
      </Head>
      {/* <CustomAudioPlayer audioPath="audio.wav" startScrolling={playMusic}/> */}
      {isFileUploaded && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '10px' }}>
          <button onClick={() => setInputType('Audio')} disabled={inputType === 'Audio'} style={{ padding: '10px 20px', fontSize: '16px', marginLeft: '10px' }}>Audio</button>
          <button onClick={() => setInputType('MIDI')} disabled={inputType === 'MIDI'} style={{ padding: '10px 20px', fontSize: '16px', marginLeft: '10px' }}>MIDI</button>
        </div>
      )}
      {inputType === 'Audio' && (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '10px' }}>
            <select
              value={selectedDevice}
              onChange={(e) => setSelectedDevice(e.target.value)}
              className="px-4 py-2 rounded-md bg-white border border-gray-300"
            >
              {audioDevices.map((device, index) => (
                <option key={index} value={device.name}>
                  {device.name}
                </option>
              ))}
            </select>
          </div>
        )}
      {isFileUploaded && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '10px' }}>
          <button onClick={playMusic} disabled={isPlaying} style={{ padding: '10px 20px', fontSize: '16px' }}>Play</button>
          <button onClick={stopMusic} disabled={!isPlaying} style={{ padding: '10px 20px', fontSize: '16px', marginLeft: '10px' }}>Stop</button>
        </div>
      )}
      {!isFileUploaded && <FileUpload backendUrl={backendUrl} onFileUpload={onFileUpload} />}
      <div ref={vfRef}></div>
    </div>
  );
};

export default IndexPage;