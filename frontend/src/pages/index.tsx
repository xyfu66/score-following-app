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
  const [inputType, setInputType] = useState<'MIDI' | 'Audio'>('');
  const [audioDevices, setAudioDevices] = useState<string[]>([]);
  const [selectedAudioDevice, setSelectedAudioDevice] = useState<string>('');
  const [midiDevices, setMidiDevices] = useState<string[]>([]);
  const [selectedMidiDevice, setSelectedMidiDevice] = useState<string>('');
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
    else if (inputType === 'MIDI') {
      fetchMidiDevices();
    }
  }, [inputType]);

  useEffect(() => {
    console.log(`Real-time position: ${realTimePosition}, Anchor position index: ${anchorPositionIndex}`);
    if (realTimePosition != anchorPositionIndex) {
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
    cursor.current.reset();
    console.log('Playing music');
    if (cursor.current && fileId.current) {
      resetStatus();

      const wsUrl = `${backendUrl.replace(/^http/, 'ws')}/ws`;
      ws.current = new WebSocket(wsUrl);
      ws.current.onopen = () => {
        console.log('WebSocket connection opened');
        ws.current?.send(JSON.stringify({ 
          file_id: fileId.current, 
          onset_beats: onsetBeats.current, 
          input_type: inputType.toLowerCase(), 
          device: inputType === 'Audio' ? selectedAudioDevice : selectedMidiDevice,
        }));
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
        setSelectedAudioDevice(data.devices[0].name);
      }
    } catch (error) {
      console.error('Error fetching audio devices:', error);
    }
  };

  const fetchMidiDevices = async () => {
    try {
      const response = await fetch(`${backendUrl}/midi-devices`);
      const data = await response.json();
      setMidiDevices(data.devices);
      if (data.devices.length > 0) {
        setSelectedMidiDevice(data.devices[0].name);
      }
    } catch (error) {
      console.error('Error fetching midi devices:', error);
    }
  };
  

  return (
    <div className="min-h-screen bg-gray-50">
      <Head>
        <title>Score Following App</title>
      </Head>
      {/* <CustomAudioPlayer audioPath="audio.wav" startScrolling={playMusic}/> */}
      {isFileUploaded && (
        <div className="flex flex-col items-center space-y-4 py-6 bg-white shadow-sm">
          {/* Input Type Selection */}
          <div className="flex space-x-4">
            <button
              onClick={() => setInputType('Audio')}
              className={`px-6 py-2 rounded-full font-medium transition-all duration-200
                ${inputType === 'Audio'
                  ? 'bg-blue-500 text-white shadow-md scale-105'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              🎤 Audio
            </button>
            <button
              onClick={() => setInputType('MIDI')}
              className={`px-6 py-2 rounded-full font-medium transition-all duration-200
                ${inputType === 'MIDI'
                  ? 'bg-blue-500 text-white shadow-md scale-105'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              🎹 MIDI
            </button>
          </div>

          {/* Device Selection */}
          {inputType === 'Audio' && (
            <div className="w-64">
              <select
                value={selectedAudioDevice}
                onChange={(e) => setSelectedAudioDevice(e.target.value)}
                className="w-full px-4 py-2 rounded-md bg-white border border-gray-200 
                  shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500
                  transition-all duration-200"
              >
                {audioDevices.map((device, index) => (
                  <option key={index} value={device.name}>
                    {device.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {inputType === 'MIDI' && (
            <div className="w-64">
              <select
                value={selectedMidiDevice}
                onChange={(e) => setSelectedMidiDevice(e.target.value)}
                className="w-full px-4 py-2 rounded-md bg-white border border-gray-200 
                  shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500
                  transition-all duration-200"
              >
                {midiDevices.map((device, index) => (
                  <option key={index} value={device.name}>
                    {device.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Playback Controls */}
          <div className="flex space-x-4">
            <button
              onClick={playMusic}
              disabled={isPlaying}
              className={`flex items-center px-6 py-2 rounded-full font-medium transition-all duration-200
                ${!isPlaying
                  ? 'bg-green-500 text-white hover:bg-green-600 shadow-md'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
            >
              <span className="mr-2">▶️</span> Play
            </button>
            <button
              onClick={stopMusic}
              disabled={!isPlaying}
              className={`flex items-center px-6 py-2 rounded-full font-medium transition-all duration-200
                ${isPlaying
                  ? 'bg-red-500 text-white hover:bg-red-600 shadow-md'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
            >
              <span className="mr-2">⏹️</span> Stop
            </button>
          </div>
        </div>
      )}
      {!isFileUploaded && <FileUpload backendUrl={backendUrl} onFileUpload={onFileUpload} />}
      <div ref={vfRef} id="osmdContainer" className="mt-4"></div>
    </div>
  );
};

export default IndexPage;