import React, { useState, useRef, useEffect } from 'react';
import Head from 'next/head';
import FileUpload from '../components/FileUpload';
import CustomAudioPlayer from '../components/AudioPlayer';
import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import { AudioPlayerRef } from '../components/AudioPlayer';

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

interface FileUploadData {
  file_id: string;
  onset_beats: number[];
  file_content: string;
  hasPerformanceFile: boolean;
}

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
  const [isSimulationMode, setIsSimulationMode] = useState(false);
  const [performanceFile, setPerformanceFile] = useState<File | null>(null);
  const audioPlayerRef = useRef<AudioPlayerRef>(null);
  const scoreContainerRef = useRef<HTMLDivElement>(null);

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
    if (realTimePosition !== anchorPositionIndex) {
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
    }
  };

  const onFileUpload = async (data: { 
    file_id: string; 
    file_content: string;
    hasPerformanceFile: boolean;
    performanceFile?: File;
  }) => {
    fileId.current = data.file_id;
    if (data.performanceFile && data.performanceFile instanceof File) {
      console.log('Performance file received:', data.performanceFile);
      setPerformanceFile(data.performanceFile);
    }
    try {
      console.log('Performance file exists:', data.hasPerformanceFile);
      setIsSimulationMode(data.hasPerformanceFile);
      
      onsetBeats.current = data.onset_beats;

      if (vfRef.current) {
        osmd.current = new OpenSheetMusicDisplay(vfRef.current);
        await osmd.current.load(data.file_content);
        await osmd.current.render();

        cursor.current = osmd.current.cursor;
        console.log('Cursor initialized:', cursor.current); // 디버깅용

        registerNoteFromOsmd(osmd.current);

        if (cursor.current) {
          cursor.current.reset();
          cursor.current.show();
          console.log('Cursor position after reset:', cursor.current.Iterator.currentTimeStamp.RealValue); // 디버깅용
        }
      }
      
      setIsFileUploaded(true);
    } catch (error) {
      console.error('Error in onFileUpload:', error);
    }
  };

  const playMusic = async () => {
    if (!cursor.current || !fileId.current) return;
    
    setIsPlaying(true);
    if (performanceFile) {
      audioPlayerRef.current?.play();
    }

    console.log('Starting music playback...');
    cursor.current.reset();

    const wsUrl = `${backendUrl.replace(/^http/, 'ws')}/ws`;
    ws.current = new WebSocket(wsUrl);

    ws.current.onopen = () => {
      console.log('WebSocket connection opened');
      const input_type = performanceFile ? 'audio' : inputType.toLowerCase();
      
      ws.current?.send(JSON.stringify({ 
        file_id: fileId.current,
        input_type: input_type,
        device: performanceFile ? '' : (inputType === 'Audio' ? selectedAudioDevice : selectedMidiDevice),
      }));
    };

    ws.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      console.log('WebSocket message received:', data);
      
      if (data.beat_position !== undefined) {
        moveToTargetBeat(data.beat_position);
      }
    };

    ws.current.onclose = () => {
      console.log('WebSocket connection closed');
      setIsPlaying(false);
    };

    ws.current.onerror = (error) => {
      console.error('WebSocket error:', error);
      setIsPlaying(false);
    };
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
    if (!osmd.current) return;
    
    cursor.current = osmd.current.cursor;
    
    if (cursor.current) {
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

      osmd.current.cursor.update();
      cursor.current.show();
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

      <div 
        ref={scoreContainerRef}
        className="flex-1 overflow-y-auto pb-32"
      >
        {!isFileUploaded && (
          <div className="max-w-2xl mx-auto pt-16 px-8">
            <h1 className="text-3xl font-bold text-center mb-8 text-gray-800">
              Score Following App
            </h1>
            <FileUpload backendUrl={backendUrl} onFileUpload={onFileUpload} />
          </div>
        )}
        {isFileUploaded && (
          <div className="flex flex-col items-center space-y-4 py-6">
            {!isSimulationMode && (
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
            )}

            {!isSimulationMode && inputType === 'Audio' && (
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

            {!isSimulationMode && inputType === 'MIDI' && (
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
        <div ref={vfRef} id="osmdContainer"></div>
      </div>

      {performanceFile && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg">
          <CustomAudioPlayer 
            ref={audioPlayerRef}
            audioFile={performanceFile}
            isPlaying={isPlaying}
            onPlay={() => {
              if (!isPlaying) playMusic();
            }}
            onPause={() => {
              if (isPlaying) stopMusic();
            }}
            onEnded={stopMusic}
          />
        </div>
      )}
    </div>
  );
};

export default IndexPage;