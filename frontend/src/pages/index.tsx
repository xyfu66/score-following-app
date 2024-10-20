import React, { useState, useRef, useEffect } from 'react';
import Head from 'next/head';
import FileUpload from '../components/FileUpload';
import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';

const IndexPage: React.FC = () => {
  const osmd = useRef<OpenSheetMusicDisplay | null>(null);
  const cursor = useRef<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isFileUploaded, setIsFileUploaded] = useState(false);
  const [frameIndex, setFrameIndex] = useState<number | null>(null); // frameIndex 상태 추가
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
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/upload`, {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      onsetFrames.current = data.onset_frames;  // onset_frames 저장
      fileId.current = data.file_id;  // 파일 식별자 저장
    } else {
      console.error('No file selected');
    }
  };

  const playMusic = () => {
    console.log('Playing music');
    if (cursor.current && fileId.current) {
      cursor.current.reset(); // 커서를 처음 위치로 이동
      cursor.current.show();
      setIsPlaying(true);

      // WebSocket 연결 시작
      const wsUrl = `${process.env.NEXT_PUBLIC_BACKEND_URL.replace(/^http/, 'ws')}/ws`;
      ws.current = new WebSocket(wsUrl);
      ws.current.onopen = () => {
        console.log('WebSocket connection opened');
        // 파일 식별자 및 onset_frames 정보 전송
        ws.current?.send(JSON.stringify({ file_id: fileId.current, onset_frames: onsetFrames.current }));
      };
      ws.current.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log('WebSocket message received:', data);
        if (frameIndex !== null && data.frame_index === frameIndex + 1) {
          moveToNextOnset();
        }
        if (data.frame_index !== undefined) {
          setFrameIndex(data.frame_index); // frame_index 값을 상태로 저장
        }
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
  };

  useEffect(() => {
    if (frameIndex !== null) {
      moveToNextOnset();
    }
  }, [frameIndex]); // frameIndex 값이 변경될 때마다 moveToNextOnset 함수 호출

  const moveToNextOnset = () => {
    console.log('Moving to next onset');
    if (cursor.current && osmd.current) {
      cursor.current.next();
      cursor.current.show(); // 커서 위치를 강제로 업데이트
      console.log('Moved to next onset');
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

    // WebSocket 연결 종료
    if (ws.current) {
      ws.current.close();

      // 연결이 닫혔는지 확인하고, 필요 시 강제로 종료
      const checkConnectionClosed = () => {
        if (ws.current && ws.current.readyState !== WebSocket.CLOSED) {
          console.log('Forcing WebSocket connection to close');
          ws.current.close();
          ws.current = null;
        }
      };

      // 일정 시간 후에도 연결이 닫히지 않으면 강제로 종료
      setTimeout(checkConnectionClosed, 1000); // 1초 후 강제 종료
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