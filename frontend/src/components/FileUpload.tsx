import React, { useEffect, useRef } from 'react';
import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';

interface FileUploadProps {
  onFileUpload: (osmd: OpenSheetMusicDisplay, cursor: any) => void;
}

const FileUpload: React.FC<FileUploadProps> = ({ onFileUpload }) => {
  const osmdContainer = useRef<HTMLDivElement>(null);
  const osmd = useRef<OpenSheetMusicDisplay | null>(null);

  useEffect(() => {
    if (osmdContainer.current) {
      osmd.current = new OpenSheetMusicDisplay(osmdContainer.current);
      console.log('OSMD initialized');
    }
  }, []);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && (file.type === 'application/xml' || file.type === 'text/xml' || /\.(xml|musicxml|mxl)$/i.test(file.name))) {
      const formData = new FormData();
      formData.append('file', file);

      try {
        console.log('process.env.NEXT_PUBLIC_BACKEND_URL: ', process.env.NEXT_PUBLIC_BACKEND_URL);
        const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/upload`, {
          method: 'POST',
          body: formData,
        });

        if (response.ok) {
          console.log('File uploaded successfully');

          const reader = new FileReader();
          reader.onload = (e) => {
            if (osmd.current && e.target?.result) {
              osmd.current.load(e.target.result as string).then(() => {
                osmd.current!.render();
                const cursor = osmd.current!.Cursor;
                cursor.show();
                console.log('Sheet music rendered');
                onFileUpload(osmd.current!, cursor);
              });
            }
          };
          reader.readAsText(file);
        } else {
          console.error('File upload failed');
        }
      } catch (error) {
        console.error('Error uploading file:', error);
      }
    } else {
      alert('Please upload a valid musicxml file.');
    }
  };

  return (
    <div>
      <input type="file" accept=".xml,.musicxml,.mxl" onChange={handleFileUpload} />
      <div ref={osmdContainer} style={{ width: '100%', height: '100vh' }}></div>
    </div>
  );
};

export default FileUpload;