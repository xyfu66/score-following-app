import React from 'react';

interface FileUploadProps {
  backendUrl: string;
  onFileUpload: (data: { file_id: string; onset_beats: number[]; file_content: string }) => void;
}

const FileUpload: React.FC<FileUploadProps> = ({ backendUrl, onFileUpload }) => {
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && (file.type === 'application/xml' || file.type === 'text/xml' || /\.(xml|musicxml|mxl)$/i.test(file.name))) {
      const formData = new FormData();
      formData.append('file', file);

      try {
        const response = await fetch(`${backendUrl}/upload`, {
          method: 'POST',
          body: formData,
        });
        const data = await response.json();

        if (response.ok) {
          console.log('File uploaded successfully');

          const reader = new FileReader();
          reader.onload = (e) => {
            if (e.target?.result) {
              onFileUpload({
                file_id: data.file_id,
                onset_beats: data.onset_beats,
                file_content: e.target.result as string,
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
    </div>
  );
};

export default FileUpload;