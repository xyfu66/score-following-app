import React, { useState, useRef, useEffect } from 'react';
import Head from 'next/head';
import FileUpload from '../components/FileUpload';
import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

const IndexPage: React.FC = () => {
  const osmd = useRef<OpenSheetMusicDisplay | null>(null);
  const cursor = useRef<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isFileUploaded, setIsFileUploaded] = useState(false);
  const [frameIndex, setFrameIndex] = useState<number>(0);
  const [currentFrame, setCurrentFrame] = useState<number>(0);
  const ws = useRef<WebSocket | null>(null);
  const onsetFrames = useRef<number[]>([]);
  const fileId = useRef<string | null>(null);

  const handleFileUpload = async (uploadedOsmd: OpenSheetMusicDisplay, uploadedCursor: any) => {
    osmd.current = uploadedOsmd;
    cursor.current = uploadedCursor;
    setIsFileUploaded(true);

    // 파일 입력 요소에서 파일 가져오기
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
      onsetFrames.current = data.onset_frames;
      fileId.current = data.file_id;
    } else {
      console.error('No file selected');
    }
  };

  const playMusic = () => {
    console.log('Playing music');
    if (cursor.current && fileId.current) {
      resetStatus();

      // WebSocket 연결 시작
      const wsUrl = `${backendUrl.replace(/^http/, 'ws')}/ws`;
      ws.current = new WebSocket(wsUrl);
      ws.current.onopen = () => {
        console.log('WebSocket connection opened');
        // 파일 식별자 및 onset_frames 정보 전송
        ws.current?.send(JSON.stringify({ file_id: fileId.current, onset_frames: onsetFrames.current }));
      };
      ws.current.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log('WebSocket message received: ', data);
        setCurrentFrame(data.frame_index);
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
      setCurrentFrame(0);
      setFrameIndex(0);
    }
  };

  useEffect(() => {
    console.log(`Current frame index: ${currentFrame}, Frame index: ${frameIndex}`);
    if (currentFrame >= frameIndex + 1) {
      moveToNextOnset();
      setFrameIndex(currentFrame);
      console.log('Frame index updated to:', frameIndex);
    }
  }, [currentFrame]);

  const moveToNextOnset = () => {
    console.log('Moving to next onset');
    if (cursor.current && osmd.current) {
      cursor.current.next();
      cursor.current.show(); // 커서 위치를 강제로 업데이트
      // console.log('Moved to next onset');
    } else {
      console.log('Cursor or OSMD is not initialized');
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

  return (
    <div>
      <Head>
        <title>Score Following App</title>
      </Head>
      {isFileUploaded && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '10px' }}>
          <button onClick={playMusic} disabled={isPlaying} style={{ padding: '10px 20px', fontSize: '16px' }}>Play</button>
          <button onClick={stopMusic} disabled={!isPlaying} style={{ padding: '10px 20px', fontSize: '16px', marginLeft: '10px' }}>Stop</button>
        </div>
      )}
      <FileUpload onFileUpload={handleFileUpload} />
    </div>
  );
};

export default IndexPage;