import React, { useRef } from 'react';
import { Upload, Image as ImageIcon } from 'lucide-react';

interface FileUploadProps {
  onImageSelect: (base64: string) => void;
  selectedImage: string | null;
}

const FileUpload: React.FC<FileUploadProps> = ({ onImageSelect, selectedImage }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        onImageSelect(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const triggerUpload = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="w-full h-full flex flex-col">
      <input
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        ref={fileInputRef}
        className="hidden"
      />
      
      {!selectedImage ? (
        <div 
          onClick={triggerUpload}
          className="flex-1 border-2 border-dashed border-gray-700 rounded-lg flex flex-col items-center justify-center p-8 cursor-pointer hover:border-radar-green hover:bg-white/5 transition-all group"
        >
          <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mb-4 group-hover:bg-gray-700 transition-colors">
            <Upload className="w-8 h-8 text-gray-400 group-hover:text-radar-green" />
          </div>
          <h3 className="text-xl font-mono font-bold text-gray-300">UPLOAD CHART INTEL</h3>
          <p className="text-gray-500 mt-2 text-center text-sm font-mono">
            Support for PNG, JPG. <br/> Clear trading view screenshots recommended.
          </p>
        </div>
      ) : (
        <div className="relative flex-1 bg-tactical-gray border border-gray-700 rounded-lg overflow-hidden flex flex-col">
           <div className="absolute top-0 left-0 bg-black/80 text-radar-green text-xs font-mono px-2 py-1 z-10 border-br rounded-br">
            SOURCE IMAGE
          </div>
          <div className="flex-1 overflow-hidden flex items-center justify-center bg-black">
             <img src={selectedImage} alt="Uploaded Chart" className="max-w-full max-h-[400px] object-contain opacity-90" />
          </div>
          <button 
            onClick={triggerUpload}
            className="w-full py-3 bg-gray-800 hover:bg-gray-700 text-xs font-mono text-center border-t border-gray-700"
          >
            RE-UPLOAD IMAGE
          </button>
        </div>
      )}
    </div>
  );
};

export default FileUpload;