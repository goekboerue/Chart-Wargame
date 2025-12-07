import React, { useRef, useEffect } from 'react';
import { Upload, Image as ImageIcon, Clipboard } from 'lucide-react';

interface FileUploadProps {
  onImageSelect: (base64: string) => void;
  selectedImage: string | null;
}

const FileUpload: React.FC<FileUploadProps> = ({ onImageSelect, selectedImage }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Enable Paste Functionality (Ctrl+V)
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      // If we already have an image and the user isn't explicitly trying to replace it, 
      // we might want to be careful, but generally, pasting overrides.
      
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          e.preventDefault(); // Prevent default paste behavior
          const blob = items[i].getAsFile();
          if (blob) {
            const reader = new FileReader();
            reader.onloadend = () => {
              onImageSelect(reader.result as string);
            };
            reader.readAsDataURL(blob);
          }
          break; // Stop after finding the first image
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('paste', handlePaste);
    };
  }, [onImageSelect]);

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
          className="flex-1 border-2 border-dashed border-gray-700 rounded-lg flex flex-col items-center justify-center p-8 cursor-pointer hover:border-radar-green hover:bg-white/5 transition-all group relative overflow-hidden"
        >
          {/* Subtle grid background for tactical feel */}
          <div className="absolute inset-0 bg-[linear-gradient(rgba(18,18,18,0.5)_1px,transparent_1px),linear-gradient(90deg,rgba(18,18,18,0.5)_1px,transparent_1px)] bg-[size:20px_20px] pointer-events-none"></div>

          <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mb-4 group-hover:bg-gray-700 transition-colors z-10 relative">
            <Upload className="w-8 h-8 text-gray-400 group-hover:text-radar-green transition-colors" />
            <div className="absolute -bottom-2 -right-2 bg-black border border-gray-600 rounded-full p-1.5">
                <Clipboard size={12} className="text-gray-400 group-hover:text-white"/>
            </div>
          </div>
          <h3 className="text-xl font-mono font-bold text-gray-300 z-10">UPLOAD OR PASTE</h3>
          <p className="text-radar-green/70 text-xs font-mono mb-2 z-10 animate-pulse">
             (CTRL + V Supported)
          </p>
          <p className="text-gray-500 mt-2 text-center text-sm font-mono z-10">
            Support for PNG, JPG. <br/> Clear trading view screenshots recommended.
          </p>
        </div>
      ) : (
        <div className="relative flex-1 bg-tactical-gray border border-gray-700 rounded-lg overflow-hidden flex flex-col group">
           <div className="absolute top-0 left-0 bg-black/80 text-radar-green text-xs font-mono px-2 py-1 z-10 border-br rounded-br backdrop-blur-sm">
            SOURCE IMAGE
          </div>
          
          <div className="flex-1 overflow-hidden flex items-center justify-center bg-black relative">
             <img src={selectedImage} alt="Uploaded Chart" className="max-w-full max-h-[400px] object-contain opacity-90" />
             
             {/* Hover overlay hint */}
             <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                <span className="text-white font-mono text-sm border border-white/20 px-3 py-1 rounded bg-black/50 backdrop-blur">
                   PASTE (CTRL+V) TO REPLACE
                </span>
             </div>
          </div>
          
          <button 
            onClick={triggerUpload}
            className="w-full py-3 bg-gray-800 hover:bg-gray-700 text-xs font-mono text-center border-t border-gray-700 transition-colors text-gray-300 hover:text-white"
          >
            RE-UPLOAD IMAGE
          </button>
        </div>
      )}
    </div>
  );
};

export default FileUpload;