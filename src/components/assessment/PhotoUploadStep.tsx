import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Camera, Upload, X, CheckCircle } from 'lucide-react';
import { AssessmentFormData } from '@/types/assessment';

interface PhotoUploadStepProps {
  formData: AssessmentFormData;
  onUpdate: (data: Partial<AssessmentFormData>) => void;
  onNext: () => void;
  onBack: () => void;
}

interface PhotoPreview {
  id: string;
  file: File;
  preview: string;
  type: 'front' | 'side' | 'back';
}

export default function PhotoUploadStep({ formData, onUpdate, onNext, onBack }: PhotoUploadStepProps) {
  const [photos, setPhotos] = useState<PhotoPreview[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const photoTypes = [
    { type: 'front' as const, label: 'Frente', description: 'Foto de frente com boa postura' },
    { type: 'side' as const, label: 'Lado', description: 'Foto de perfil lateral' },
    { type: 'back' as const, label: 'Costas', description: 'Foto de costas com postura reta' }
  ];

  const handleFileSelect = (files: FileList | null, type: 'front' | 'side' | 'back') => {
    if (!files || files.length === 0) return;

    const file = files[0];
    if (!file.type.startsWith('image/')) return;

    // Comprimir imagem
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Redimensionar para máximo 800px
        const maxSize = 800;
        let width = img.width;
        let height = img.height;

        if (width > height && width > maxSize) {
          height = (height * maxSize) / width;
          width = maxSize;
        } else if (height > maxSize) {
          width = (width * maxSize) / height;
          height = maxSize;
        }

        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob((blob) => {
          if (!blob) return;
          const compressedFile = new File([blob], file.name, {
            type: 'image/jpeg',
            lastModified: Date.now()
          });

          const preview = canvas.toDataURL('image/jpeg', 0.8);
          const photo: PhotoPreview = {
            id: `${type}-${Date.now()}`,
            file: compressedFile,
            preview,
            type
          };

          setPhotos(prev => {
            const filtered = prev.filter(p => p.type !== type);
            return [...filtered, photo];
          });
        }, 'image/jpeg', 0.8);
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent, type: 'front' | 'side' | 'back') => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer.files, type);
  };

  const removePhoto = (photoId: string) => {
    setPhotos(prev => prev.filter(p => p.id !== photoId));
  };

  const handleNext = () => {
    onNext();
  };

  const isComplete = photos.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Fotos da Avaliação</h2>
        <p className="text-gray-600">Adicione fotos para acompanhar a evolução física (opcional)</p>
      </div>

      <div className="grid gap-6">
        {photoTypes.map(({ type, label, description }) => {
          const existingPhoto = photos.find(p => p.type === type);

          return (
            <div key={type} className="border-2 border-dashed border-gray-300 rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{label}</h3>
                  <p className="text-sm text-gray-600">{description}</p>
                </div>
                {existingPhoto && (
                  <CheckCircle className="w-6 h-6 text-green-500" />
                )}
              </div>

              {existingPhoto ? (
                <div className="relative">
                  <img
                    src={existingPhoto.preview}
                    alt={`Foto ${label}`}
                    className="w-full h-48 object-cover rounded-lg"
                  />
                  <button
                    onClick={() => removePhoto(existingPhoto.id)}
                    className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div
                  className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
                    }`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, type)}
                >
                  <Camera className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600 mb-2">Arraste a foto aqui ou</p>
                  <button
                    onClick={() => {
                      if (fileInputRef.current) {
                        fileInputRef.current.onchange = (e) => {
                          const target = e.target as HTMLInputElement;
                          handleFileSelect(target.files, type);
                        };
                        fileInputRef.current.click();
                      }
                    }}
                    className="inline-flex items-center px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Escolher Foto
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
      />

      <div className="flex justify-between pt-6">
        <button
          onClick={onBack}
          className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Voltar
        </button>
        <button
          onClick={handleNext}
          className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={!isComplete}
        >
          Próximo
        </button>
      </div>

      <p className="text-sm text-gray-500 text-center">
        As fotos são opcionais mas ajudam a visualizar a evolução física
      </p>
    </motion.div>
  );
}
