import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Save, 
  FolderOpen, 
  Undo2, 
  Redo2, 
  Key, 
  Maximize2, 
  RotateCcw, 
  Download, 
  RefreshCw,
  ExternalLink,
  Coffee,
  X,
  Info,
  Plus,
  Trash2,
  Star,
  Image as ImageIcon,
  Upload,
  ChevronLeft,
  ChevronRight,
  Loader2,
  CheckCircle2,
  FileArchive,
  History
} from 'lucide-react';
import { useHistory } from './hooks/useHistory';
import { slugify, downloadJson } from './lib/utils';
import { GoogleGenAI } from "@google/genai";
import JSZip from 'jszip';
import * as XLSX from 'xlsx';

// --- Types ---
interface Character {
  id: string;
  name: string;
  description: string;
  images: string[]; // base64
  isDefault: boolean;
}

interface Scene {
  id: string;
  stt: string;
  lang1: string;
  vietnamese: string;
  promptName: string;
  contextDescription: string;
  selectedCharacterIds: string[];
  imageHistory: string[];
  primaryImageIndex: number;
  videoPrompt?: string;
  isGenerating?: boolean;
  isVideoGenerating?: boolean;
  costInfo?: {
    estimated: { input: number; output: number; cost: number };
    actual?: { input: number; output: number; cost: number; diffPercent: number };
  };
}

interface AppState {
  projectName: string;
  activeTab: string;
  characters: Character[];
  scenes: Scene[];
  stylePrompt: string;
  videoPromptNote: string;
  totalStats: {
    inputTokens: number;
    outputTokens: number;
    totalCost: number;
  };
}

// --- Components ---

const ApiKeyModal = ({ isOpen, onClose, apiKey, setApiKey }: { 
  isOpen: boolean; 
  onClose: () => void; 
  apiKey: string; 
  setApiKey: (val: string) => void 
}) => (
  <AnimatePresence>
    {isOpen && (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0 }} 
          animate={{ opacity: 1 }} 
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />
        <motion.div 
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          className="relative w-full max-w-md glass p-8 rounded-3xl shadow-2xl"
        >
          <button onClick={onClose} className="absolute top-4 right-4 p-2 hover:bg-white/10 rounded-full transition-colors">
            <X size={20} />
          </button>
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
            <Key className="text-primary" />
            Quản lý API Key
          </h2>
          <div className="space-y-4">
            <p className="text-sm text-neutral-400">
              Nhập Gemini API Key của bạn để sử dụng các tính năng AI. Nếu để trống, hệ thống sẽ sử dụng key mặc định.
            </p>
            <input 
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Nhập API Key tại đây..."
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-primary transition-colors"
            />
            <button 
              onClick={onClose}
              className="w-full primary-gradient py-3 rounded-xl font-semibold hover:brightness-110 transition-all shadow-lg shadow-primary/20"
            >
              Lưu cấu hình
            </button>
          </div>
        </motion.div>
      </div>
    )}
  </AnimatePresence>
);

const CoffeeModal = ({ isOpen, onClose, bubbleText }: { isOpen: boolean; onClose: () => void; bubbleText: string }) => (
  <AnimatePresence>
    {isOpen && (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0 }} 
          animate={{ opacity: 1 }} 
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />
        <motion.div 
          initial={{ scale: 0.9, opacity: 0, x: 50 }}
          animate={{ scale: 1, opacity: 1, x: 0 }}
          exit={{ scale: 0.9, opacity: 0, x: 50 }}
          className="relative w-full max-w-sm glass p-8 rounded-3xl shadow-2xl text-center"
        >
          <button onClick={onClose} className="absolute top-4 right-4 p-2 hover:bg-white/10 rounded-full transition-colors">
            <X size={20} />
          </button>
          <div className="mb-6 inline-flex p-4 bg-primary/10 rounded-full">
            <Coffee className="text-primary" size={32} />
          </div>
          <h2 className="text-xl font-bold mb-4">Mời Xizital một ly cà phê</h2>
          <div className="bg-white p-4 rounded-2xl mb-6">
            <img 
              src="https://xizital.com/wp-content/uploads/2025/10/z7084477223291_1aa5f551f0f549b6d3d1d72d70e3d4e4.jpg" 
              alt="QR Code" 
              className="w-full h-auto rounded-lg"
              referrerPolicy="no-referrer"
            />
          </div>
          <p className="text-sm text-neutral-300 leading-relaxed mb-4">
            Mời Xizital một ly cà phê nếu bạn thấy những chia sẻ của mình hữu ích
          </p>
          <div className="text-xs text-neutral-500 italic border-t border-white/10 pt-4">
            {bubbleText}
          </div>
        </motion.div>
      </div>
    )}
  </AnimatePresence>
);

function CharacterCard({ 
  character, 
  onUpdate, 
  onSetDefault 
}: { 
  key?: React.Key;
  character: Character; 
  onUpdate: (updates: Partial<Character>) => void;
  onSetDefault: () => void;
}) {
  const [isDragging, setIsDragging] = useState(false);

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const currentCount = character.images.length;
    const remaining = 5 - currentCount;
    const toProcess = Array.from(files).slice(0, remaining);

    toProcess.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = e.target?.result as string;
        onUpdate({ images: [...character.images, base64] });
      };
      reader.readAsDataURL(file);
    });
  };

  return (
    <div className="glass rounded-2xl p-6 space-y-4 relative group">
      <button 
        onClick={onSetDefault}
        className={`absolute top-4 right-4 p-2 rounded-full transition-all ${
          character.isDefault ? 'bg-primary text-white shadow-lg shadow-primary/30' : 'bg-white/5 text-neutral-500 hover:text-primary'
        }`}
      >
        <Star size={16} fill={character.isDefault ? 'currentColor' : 'none'} />
      </button>

      <div className="space-y-2">
        <input 
          type="text"
          value={character.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          placeholder="Tên nhân vật..."
          className="w-full bg-transparent text-lg font-bold focus:outline-none focus:text-primary transition-colors"
        />
        <textarea 
          value={character.description}
          onChange={(e) => onUpdate({ description: e.target.value })}
          placeholder="Mô tả đặc điểm đồng nhất..."
          className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm focus:outline-none focus:border-primary transition-colors resize-none h-20"
        />
      </div>

      <div 
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files); }}
        className={`relative border-2 border-dashed rounded-xl p-4 transition-all flex flex-col items-center justify-center gap-2 min-h-[120px] ${
          isDragging ? 'border-primary bg-primary/5' : 'border-white/10 hover:border-primary/30'
        }`}
      >
        {character.images.length < 5 ? (
          <>
            <Upload size={24} className="text-neutral-500" />
            <p className="text-[10px] text-neutral-500 text-center uppercase tracking-widest">
              Kéo thả hoặc click để upload (Tối đa 5)
            </p>
            <input 
              type="file" 
              multiple 
              accept="image/*"
              onChange={(e) => handleFiles(e.target.files)}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
          </>
        ) : (
          <div className="text-xs text-primary font-bold">Đã đạt giới hạn ảnh</div>
        )}
      </div>

      <div className="grid grid-cols-5 gap-2">
        {character.images.map((img, idx) => (
          <div key={idx} className="relative aspect-square rounded-lg overflow-hidden group/img">
            <img src={img} alt="Character" className="w-full h-full object-cover" />
            <button 
              onClick={() => onUpdate({ images: character.images.filter((_, i) => i !== idx) })}
              className="absolute inset-0 bg-black/60 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center text-red-500"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

function CharacterSelector({ 
  isOpen, 
  onClose, 
  characters, 
  selectedIds, 
  onToggle 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  characters: Character[]; 
  selectedIds: string[]; 
  onToggle: (id: string) => void 
}) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
            className="relative w-full max-w-md glass p-8 rounded-3xl shadow-2xl"
          >
            <h3 className="text-xl font-bold mb-6">Chọn nhân vật</h3>
            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
              {characters.map(char => (
                <button
                  key={char.id}
                  onClick={() => onToggle(char.id)}
                  className={`w-full flex items-center gap-4 p-4 rounded-2xl border transition-all ${
                    selectedIds.includes(char.id) ? 'bg-primary/10 border-primary' : 'bg-white/5 border-white/10 hover:bg-white/10'
                  }`}
                >
                  <div className="w-12 h-12 rounded-full overflow-hidden bg-neutral-800 flex-shrink-0">
                    {char.images[0] ? <img src={char.images[0]} className="w-full h-full object-cover" /> : <ImageIcon className="m-auto text-neutral-600" />}
                  </div>
                  <div className="text-left">
                    <div className="font-bold">{char.name || 'Chưa đặt tên'}</div>
                    <div className="text-xs text-neutral-500 truncate max-w-[200px]">{char.description}</div>
                  </div>
                  {selectedIds.includes(char.id) && <CheckCircle2 className="ml-auto text-primary" size={20} />}
                </button>
              ))}
            </div>
            <button 
              onClick={onClose}
              className="w-full mt-6 primary-gradient py-3 rounded-xl font-bold"
            >
              Xong
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function FullImageViewer({ 
  scenes, 
  currentIndex, 
  onClose, 
  onNavigate, 
  onRegenerate,
  onSetPrimary
}: { 
  scenes: Scene[]; 
  currentIndex: number; 
  onClose: () => void; 
  onNavigate: (dir: 'prev' | 'next') => void;
  onRegenerate: (index: number, prompt: string) => void;
  onSetPrimary: (sceneIndex: number, imageIndex: number) => void;
}) {
  const scene = scenes[currentIndex];
  const [refinePrompt, setRefinePrompt] = useState('');
  const currentImageUrl = scene.imageHistory[scene.primaryImageIndex];

  const downloadImage = (url: string, name: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = `${name}.png`;
    link.click();
  };

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-black/95 backdrop-blur-xl">
      <div className="flex items-center justify-between p-6 border-b border-white/10">
        <div className="flex items-center gap-4">
          <div className="text-primary font-black text-xl">SCENE {scene.stt}</div>
          <div className="text-neutral-400 text-sm max-w-xl truncate">{scene.promptName}</div>
        </div>
        <div className="flex items-center gap-4">
          {currentImageUrl && (
            <button 
              onClick={() => downloadImage(currentImageUrl, `scene-${scene.stt}-v${scene.primaryImageIndex + 1}`)}
              className="flex items-center gap-2 px-4 py-2 glass rounded-xl text-xs font-bold hover:bg-white/10 transition-all"
            >
              <Download size={14} />
              Tải ảnh hiện tại
            </button>
          )}
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <X size={24} />
          </button>
        </div>
      </div>

      <div className="flex-1 relative flex items-center justify-center p-12">
        <button 
          onClick={() => onNavigate('prev')}
          className="absolute left-6 p-4 hover:bg-white/10 rounded-full transition-colors disabled:opacity-20"
          disabled={currentIndex === 0}
        >
          <ChevronLeft size={48} />
        </button>

        <div className="relative max-w-full max-h-full flex flex-col items-center gap-6">
          {currentImageUrl ? (
            <img src={currentImageUrl} alt="Full View" className="max-w-full max-h-[60vh] object-contain rounded-2xl shadow-2xl" />
          ) : (
            <div className="w-[600px] h-[400px] bg-white/5 rounded-2xl flex items-center justify-center">
              <ImageIcon size={64} className="text-neutral-700" />
            </div>
          )}
          
          <div className="w-full max-w-4xl space-y-6">
            {/* History Strip */}
            {scene.imageHistory.length > 0 && (
              <div className="glass p-4 rounded-2xl">
                <div className="text-[10px] text-neutral-500 uppercase tracking-widest font-bold mb-3 flex items-center gap-2">
                  <History size={12} />
                  Lịch sử tạo ảnh ({scene.imageHistory.length})
                </div>
                <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
                  {scene.imageHistory.map((img, idx) => (
                    <div 
                      key={idx} 
                      className={`relative flex-shrink-0 w-24 aspect-video rounded-lg overflow-hidden border-2 transition-all cursor-pointer group/hist ${
                        idx === scene.primaryImageIndex ? 'border-primary shadow-lg shadow-primary/20' : 'border-transparent hover:border-white/30'
                      }`}
                      onClick={() => onSetPrimary(currentIndex, idx)}
                    >
                      <img src={img} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/hist:opacity-100 transition-opacity flex items-center justify-center gap-1">
                        <button 
                          onClick={(e) => { e.stopPropagation(); downloadImage(img, `scene-${scene.stt}-v${idx + 1}`); }}
                          className="p-1 bg-white/10 rounded-md hover:bg-primary transition-colors"
                        >
                          <Download size={10} />
                        </button>
                      </div>
                      {idx === scene.primaryImageIndex && (
                        <div className="absolute top-1 right-1 bg-primary text-white p-0.5 rounded-full">
                          <CheckCircle2 size={8} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="glass p-6 rounded-2xl space-y-4">
              <div className="flex gap-4">
                <input 
                  type="text"
                  value={refinePrompt}
                  onChange={(e) => setRefinePrompt(e.target.value)}
                  placeholder="Tinh chỉnh lại ảnh..."
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-primary transition-colors"
                />
                <button 
                  onClick={() => onRegenerate(currentIndex, refinePrompt)}
                  disabled={scene.isGenerating}
                  className="primary-gradient px-6 rounded-xl font-bold flex items-center gap-2 disabled:opacity-50"
                >
                  {scene.isGenerating ? <Loader2 className="animate-spin" /> : <RefreshCw size={18} />}
                  Tạo bản mới
                </button>
              </div>
            </div>
          </div>
        </div>

        <button 
          onClick={() => onNavigate('next')}
          className="absolute right-6 p-4 hover:bg-white/10 rounded-full transition-colors disabled:opacity-20"
          disabled={currentIndex === scenes.length - 1}
        >
          <ChevronRight size={48} />
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [zoom, setZoom] = useState(1);
  const [isSticky, setIsSticky] = useState(false);
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const [isCoffeeModalOpen, setIsCoffeeModalOpen] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [bubbleText, setBubbleText] = useState('Donate to support');
  const [activeSelectorSceneId, setActiveSelectorSceneId] = useState<string | null>(null);
  const [fullViewIndex, setFullViewIndex] = useState<number | null>(null);
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [isGeneratingAllVideo, setIsGeneratingAllVideo] = useState(false);
  const [isRefiningNote, setIsRefiningNote] = useState(false);
  
  const { state, set, undo, redo, canUndo, canRedo } = useHistory<AppState>({
    projectName: '',
    activeTab: 'main',
    characters: [
      { id: '1', name: '', description: '', images: [], isDefault: true },
      { id: '2', name: '', description: '', images: [], isDefault: false },
      { id: '3', name: '', description: '', images: [], isDefault: false },
    ],
    scenes: [],
    stylePrompt: '',
    videoPromptNote: '',
    totalStats: {
      inputTokens: 0,
      outputTokens: 0,
      totalCost: 0
    }
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);

  // --- Cost Calculation Helpers ---
  const PRICING = {
    INPUT_TEXT: 0.30 / 1_000_000,
    OUTPUT_TEXT: 2.50 / 1_000_000,
    INPUT_IMAGE: 0.30 / 1_000_000, // Assuming image tokens are priced same as text/video input
  };

  const estimateTokens = (text: string, imageCount: number) => {
    const textTokens = Math.ceil(text.length / 4); // Rough estimate: 1 token ~= 4 chars
    const imageTokens = imageCount * 258; // Standard Gemini image token count
    return textTokens + imageTokens;
  };

  const refineVideoNote = async () => {
    const key = apiKey || process.env.GEMINI_API_KEY;
    if (!key || !state.videoPromptNote) return;
    setIsRefiningNote(true);
    try {
      const ai = new GoogleGenAI({ apiKey: key });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-preview',
        contents: `Hãy viết lại (wording) đoạn lưu ý sau đây thành một đoạn văn ngắn gọn, chuyên nghiệp và súc tích để đưa vào prompt tạo video AI (VEO-3.1). Lưu ý này sẽ được áp dụng cho tất cả các video trong dự án để đảm bảo tính tuân thủ. Chỉ trả về đoạn văn đã được viết lại, không thêm bất kỳ lời dẫn nào khác. Nội dung: ${state.videoPromptNote}`
      });
      const refined = response.text?.trim() || state.videoPromptNote;
      set({ ...state, videoPromptNote: refined });
    } catch (error) {
      console.error('Refine note failed', error);
    } finally {
      setIsRefiningNote(false);
    }
  };

  const generateVideoPrompt = async (sceneIndex: number) => {
    const scene = state.scenes[sceneIndex];
    const prevScene = state.scenes[sceneIndex - 1];
    const nextScene = state.scenes[sceneIndex + 1];
    const key = apiKey || process.env.GEMINI_API_KEY;
    if (!key) {
      alert('Vui lòng nhập API Key!');
      return;
    }

    const ai = new GoogleGenAI({ apiKey: key });
    
    // Update state to generating
    const newScenes = [...state.scenes];
    newScenes[sceneIndex] = { ...newScenes[sceneIndex], isVideoGenerating: true };
    set({ ...state, scenes: newScenes });

    try {
      const parts: any[] = [];
      
      // Data A: Current Image
      if (scene.imageUrl) {
        parts.push({
          inlineData: {
            data: scene.imageUrl.split(',')[1],
            mimeType: "image/png"
          }
        });
      }

      // Context Data
      const contextText = `
        Dữ liệu A (Ảnh minh họa hiện tại): ${scene.imageUrl ? 'Đã đính kèm' : 'Chưa có'}
        Dữ liệu B (Kịch bản Tiếng Việt hiện tại): ${scene.vietnamese}
        Dữ liệu C (Mô tả bối cảnh hiện tại): ${scene.contextDescription}
        
        Bối cảnh xung quanh:
        B0 (Kịch bản hàng trên): ${prevScene?.vietnamese || 'Không có'}
        C0 (Bối cảnh hàng trên): ${prevScene?.contextDescription || 'Không có'}
        B2 (Kịch bản hàng dưới): ${nextScene?.vietnamese || 'Không có'}
        C2 (Bối cảnh hàng dưới): ${nextScene?.contextDescription || 'Không có'}
        
        Lưu ý chung cho video: ${state.videoPromptNote}
      `;

      const prompt = `
        Từ kịch bản [${scene.vietnamese}] và ảnh minh họa cho kịch bản là [Dữ liệu A] hãy viết Prompt Video (Prompt để tạo ra video 8 giây model VEO-3.1 của google để minh họa cho phân đoạn kịch bản này [${scene.vietnamese}]. 
        Prompt bắt buộc viết 100% bằng tiếng anh trừ những đoạn hội thoại thì có thể lời thoại là ngôn ngữ khác đúng theo kịch bản). Prompt tạo video bắt buộc phải theo Format dưới đây:
        “Hãy tạo một video 8 giây
        Với góc máy ban đầu: là bối cảnh trong ảnh [Dữ liệu A]
        Chuyển động nếu chia làm nhiều cảnh thì 
        Cảnh 1 mấy giây: Kỹ thuật di chuyển camera sử dụng trong cảnh 1 này là gì, di chuyển từ đâu đến đâu, có chia làm nhiều cảnh hay không, nếu cắt cảnh thì sử dụng kỹ thuật gì để cắt cảnh (ví dụ Match cut, match action,...), nhân vật hành động thế nào, biểu cảm ra sao, nói gì hay không nói, nếu nói thì chi tiết giọng nói thế nào (mô tả thật chi tiết bằng các thuật ngữ mô tả giọng nói), nói tiếng gì vùng miền nào của quốc gia đó (mô tả chi tiết), nhạc nền là nhạc không lời, âm thanh môi trường hay không có âm thanh nền.
        Tương tự các cảnh sau cũng vậy nhưng phải phù hợp với tất cả các chi tiết trong bối cảnh ảnh [Dữ liệu A] 
        Chuyển động đấy đưa đến cảnh quay cuối cùng: Bối cảnh ở đâu, camera đặt ở đâu trong bối cảnh đấy, góc camera hướng về nhân vật, (các) nhân vật đứng ở đâu trong bối cảnh đấy, từng nhân vật có ngoại hình chi tiết thế nào (giới tính, độ tuổi, mô tả chi tiết áo, mô tả chi tiết quần, mô tả chi tiết kiểu tóc, mô tả chi tiết khuôn mặt đảm bảo đồng nhất ở tất cả các cảnh, mô tả chi tiết tỉ lệ kích thước đầu và các bộ phận, mô tả chi tiết biểu cảm nhân vật), nhân vật hướng bộ phận nào về camera (đầu, lưng, chân gần đầu xa,...), khoảng cách giữa người và camera, các chi tiết/nhân vật phụ. Lưu ý là chuyển động phải phù hợp với nội dung đoạn này là [${scene.vietnamese}].
        Lưu ý chung: Không cần gọi tên nhân vật trong Prompt, tập trung vào mô tả chi tiết, biết rằng mỗi video sẽ dài khoảng 8 giây. Prompt tập trung vào chất lượng vì vậy mỗi prompt video viết ra cần phải minh họa được kịch bản là [${scene.vietnamese}] và dài không dưới 300 chữ.
        Bổ sung lưu ý đặc biệt: ${state.videoPromptNote}
        Bắt buộc tuân thủ, chỉ viết prompt không nói thêm bất cứ một điều gì khác prompt trong câu trả lời, không chào hỏi, không trình bày, không báo cáo sẽ bắt đầu hay hoàn thành. Tức là bắt đầu từ prompt và kết thúc prompt. Prompt viết trong 1 đoạn duy nhất, không được xuống dòng, nếu ngắt ý thì ngắt bởi dấu chấm.
        
        Dữ liệu bổ sung để hiểu context:
        ${contextText}
      `;

      parts.push({ text: prompt });

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-preview',
        contents: { parts }
      });

      const videoPrompt = response.text?.trim() || '';
      const usage = response.usageMetadata;
      const actualInput = usage?.promptTokenCount || 0;
      const actualOutput = usage?.candidatesTokenCount || 0;
      const actualCost = (actualInput * PRICING.INPUT_TEXT) + (actualOutput * PRICING.OUTPUT_TEXT);

      const updatedScenes = [...state.scenes];
      updatedScenes[sceneIndex] = { 
        ...updatedScenes[sceneIndex], 
        videoPrompt, 
        isVideoGenerating: false 
      };

      set({ 
        ...state, 
        scenes: updatedScenes,
        totalStats: {
          inputTokens: state.totalStats.inputTokens + actualInput,
          outputTokens: state.totalStats.outputTokens + actualOutput,
          totalCost: state.totalStats.totalCost + actualCost
        }
      });

    } catch (error) {
      console.error('Video prompt generation failed', error);
      const updatedScenes = [...state.scenes];
      updatedScenes[sceneIndex] = { ...updatedScenes[sceneIndex], isVideoGenerating: false };
      set({ ...state, scenes: updatedScenes });
      alert('Tạo prompt video thất bại.');
    }
  };

  const generateAllVideoPrompts = async () => {
    setIsGeneratingAllVideo(true);
    for (let i = 0; i < state.scenes.length; i++) {
      await generateVideoPrompt(i);
    }
    setIsGeneratingAllVideo(false);
  };

  // --- Gemini Logic ---
  const generateImage = async (sceneIndex: number, customPrompt?: string) => {
    const scene = state.scenes[sceneIndex];
    const key = apiKey || process.env.GEMINI_API_KEY;
    if (!key) {
      alert('Vui lòng nhập API Key!');
      return;
    }

    const ai = new GoogleGenAI({ apiKey: key });
    
    // 1. Estimate Cost
    const finalPrompt = customPrompt || `${state.stylePrompt} ${scene.contextDescription}`;
    const selectedChars = state.characters.filter(c => scene.selectedCharacterIds.includes(c.id));
    const totalImages = selectedChars.reduce((acc, char) => acc + char.images.length, 0);
    
    const estInputTokens = estimateTokens(finalPrompt, totalImages);
    const estOutputTokens = 1024; // Placeholder for image generation "tokens" or typical response
    const estCost = (estInputTokens * PRICING.INPUT_TEXT) + (estOutputTokens * PRICING.OUTPUT_TEXT);

    // Update generating state with estimate
    const newScenes = [...state.scenes];
    newScenes[sceneIndex] = { 
      ...newScenes[sceneIndex], 
      isGenerating: true,
      costInfo: {
        estimated: { input: estInputTokens, output: estOutputTokens, cost: estCost }
      }
    };
    set({ ...state, scenes: newScenes });

    try {
      const parts: any[] = [];
      
      // Add character context
      selectedChars.forEach(char => {
        char.images.forEach(img => {
          parts.push({
            inlineData: {
              data: img.split(',')[1],
              mimeType: "image/png"
            }
          });
        });
        parts.push({ text: `Character ${char.name}: ${char.description}` });
      });

      parts.push({ text: `Generate a high quality image for this scene description: ${finalPrompt}. Ensure the characters mentioned look exactly like the provided images. DO NOT add any text to the image. Ensure background consistency with previous scenes if applicable.` });

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-preview', // Using the requested model
        contents: { parts },
        config: {
          imageConfig: {
            aspectRatio: "16:9",
            imageSize: "1K"
          }
        }
      });

      // 2. Calculate Actual Cost
      const usage = response.usageMetadata;
      const actualInput = usage?.promptTokenCount || estInputTokens;
      const actualOutput = usage?.candidatesTokenCount || 0;
      const actualCost = (actualInput * PRICING.INPUT_TEXT) + (actualOutput * PRICING.OUTPUT_TEXT);
      const diffPercent = estCost > 0 ? ((actualCost - estCost) / estCost) * 100 : 0;

      let imageUrl = '';
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          imageUrl = `data:image/png;base64,${part.inlineData.data}`;
          break;
        }
      }

      const updatedScenes = [...state.scenes];
      const newImageHistory = [...(updatedScenes[sceneIndex].imageHistory || [])];
      if (imageUrl) {
        newImageHistory.push(imageUrl);
      }
      
      updatedScenes[sceneIndex] = { 
        ...updatedScenes[sceneIndex], 
        imageHistory: newImageHistory,
        primaryImageIndex: newImageHistory.length - 1,
        isGenerating: false,
        costInfo: {
          ...updatedScenes[sceneIndex].costInfo!,
          actual: { input: actualInput, output: actualOutput, cost: actualCost, diffPercent }
        }
      };

      set({ 
        ...state, 
        scenes: updatedScenes,
        totalStats: {
          inputTokens: state.totalStats.inputTokens + actualInput,
          outputTokens: state.totalStats.outputTokens + actualOutput,
          totalCost: state.totalStats.totalCost + actualCost
        }
      });

    } catch (error) {
      console.error('Generation failed', error);
      const updatedScenes = [...state.scenes];
      updatedScenes[sceneIndex] = { ...updatedScenes[sceneIndex], isGenerating: false };
      set({ ...state, scenes: updatedScenes });
      alert('Tạo ảnh thất bại. Vui lòng thử lại.');
    }
  };

  const generateAll = async () => {
    setIsGeneratingAll(true);
    for (let i = 0; i < state.scenes.length; i++) {
      await generateImage(i);
    }
    setIsGeneratingAll(false);
  };

  const downloadAllAsZip = async () => {
    const zip = new JSZip();
    state.scenes.forEach(scene => {
      const primaryImage = scene.imageHistory[scene.primaryImageIndex];
      if (primaryImage) {
        const base64 = primaryImage.split(',')[1];
        zip.file(`${scene.stt}.png`, base64, { base64: true });
      }
    });
    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${slugify(state.projectName || 'project')}-images.zip`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // --- Handlers ---
  const handleSave = () => {
    const filename = state.projectName ? `${slugify(state.projectName)}.json` : 'project.json';
    downloadJson(state, filename);
  };

  const handleOpen = () => {
    fileInputRef.current?.click();
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        set(data);
      } catch (err) {
        console.error('Failed to parse project file', err);
      }
    };
    reader.readAsText(file);
  };

  const handleExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

      // Skip first row (header)
      const rows = data.slice(1);
      const defaultCharId = state.characters.find(c => c.isDefault)?.id || state.characters[0].id;

      const newScenes: Scene[] = rows.map((row) => {
        const stt = String(row[0] || '');
        const hasCharacter = stt.toUpperCase().includes('C');
        
        return {
          id: Math.random().toString(36).substr(2, 9),
          stt: stt,
          lang1: String(row[1] || ''),
          vietnamese: String(row[2] || ''),
          promptName: String(row[3] || ''),
          contextDescription: String(row[4] || ''),
          videoPrompt: '',
          imageHistory: [],
          primaryImageIndex: 0,
          selectedCharacterIds: hasCharacter ? [defaultCharId] : [],
        };
      });

      set({ ...state, scenes: newScenes });
    };
    reader.readAsBinaryString(file);
  };

  const addScene = () => {
    const defaultCharId = state.characters.find(c => c.isDefault)?.id || state.characters[0].id;
    const newScene: Scene = {
      id: Math.random().toString(36).substr(2, 9),
      stt: (state.scenes.length + 1).toString(),
      lang1: '',
      vietnamese: '',
      promptName: '',
      contextDescription: '',
      videoPrompt: '',
      imageHistory: [],
      primaryImageIndex: 0,
      selectedCharacterIds: [defaultCharId]
    };
    set({ ...state, scenes: [...state.scenes, newScene] });
  };

  const updateCharacter = (id: string, updates: Partial<Character>) => {
    set({
      ...state,
      characters: state.characters.map(c => c.id === id ? { ...c, ...updates } : c)
    });
  };

  const setDefaultCharacter = (id: string) => {
    set({
      ...state,
      characters: state.characters.map(c => ({ ...c, isDefault: c.id === id }))
    });
  };

  const updateScene = (id: string, updates: Partial<Scene>) => {
    set({
      ...state,
      scenes: state.scenes.map(s => s.id === id ? { ...s, ...updates } : s)
    });
  };

  const toggleCharacterInScene = (sceneId: string, charId: string) => {
    const scene = state.scenes.find(s => s.id === sceneId);
    if (!scene) return;
    const selected = scene.selectedCharacterIds.includes(charId)
      ? scene.selectedCharacterIds.filter(id => id !== charId)
      : [...scene.selectedCharacterIds, charId];
    updateScene(sceneId, { selectedCharacterIds: selected });
  };

  // --- Effects ---
  useEffect(() => {
    const handleScroll = () => {
      setIsSticky(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 's') {
          e.preventDefault();
          handleSave();
        } else if (e.key === 'o') {
          e.preventDefault();
          handleOpen();
        } else if (e.key === 'z') {
          e.preventDefault();
          if (e.shiftKey) redo();
          else undo();
        }
      }
    };

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        setZoom(prev => {
          const delta = e.deltaY > 0 ? -0.1 : 0.1;
          return Math.min(Math.max(prev + delta, 0.5), 2);
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('wheel', handleWheel);
    };
  }, [state, undo, redo]);

  return (
    <div className="relative min-h-screen">
      <div className="glow-bg" />
      
      {/* --- Header --- */}
      <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isSticky ? 'glass py-3' : 'bg-transparent py-6'
      }`}>
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-black tracking-tighter text-gradient">
              XIZITAL PRO APP
            </h1>
            <div className="h-6 w-[1px] bg-white/10 mx-2" />
            <div className="flex items-center gap-2">
              <button 
                onClick={handleSave}
                className="p-2 hover:bg-white/5 rounded-lg transition-colors group relative"
                title="Save (Ctrl+S)"
              >
                <Save size={20} className="group-hover:text-primary transition-colors" />
              </button>
              <button 
                onClick={handleOpen}
                className="p-2 hover:bg-white/5 rounded-lg transition-colors group relative"
                title="Open (Ctrl+O)"
              >
                <FolderOpen size={20} className="group-hover:text-primary transition-colors" />
              </button>
              <div className="w-[1px] h-4 bg-white/10 mx-1" />
              <button 
                onClick={undo} 
                disabled={!canUndo}
                className="p-2 hover:bg-white/5 rounded-lg transition-colors disabled:opacity-30 group"
                title="Undo (Ctrl+Z)"
              >
                <Undo2 size={20} className="group-hover:text-primary transition-colors" />
              </button>
              <button 
                onClick={redo} 
                disabled={!canRedo}
                className="p-2 hover:bg-white/5 rounded-lg transition-colors disabled:opacity-30 group"
                title="Redo (Ctrl+Shift+Z)"
              >
                <Redo2 size={20} className="group-hover:text-primary transition-colors" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden md:flex flex-col items-end mr-4 border-r border-white/10 pr-4">
              <div className="text-[10px] text-neutral-500 uppercase tracking-widest font-bold">Total Project Cost</div>
              <div className="text-primary font-black text-lg">${state.totalStats.totalCost.toFixed(4)}</div>
              <div className="text-[8px] text-neutral-400">In: {state.totalStats.inputTokens.toLocaleString()} | Out: {state.totalStats.outputTokens.toLocaleString()}</div>
            </div>
            <button 
              onClick={() => setIsApiKeyModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 glass rounded-xl hover:bg-primary/10 hover:border-primary/50 transition-all group"
            >
              <Key size={18} className="group-hover:text-primary" />
              <span className="text-sm font-medium">API Key</span>
            </button>
          </div>
        </div>
      </header>

      {/* --- Zoom Reset Indicator --- */}
      {zoom !== 1 && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed top-24 right-6 z-40"
        >
          <button 
            onClick={() => setZoom(1)}
            className="flex items-center gap-2 px-4 py-2 glass border-primary/30 rounded-full text-xs font-bold text-primary hover:bg-primary/10 transition-all"
          >
            <RotateCcw size={14} />
            {Math.round(zoom * 100)}% - RESET
          </button>
        </motion.div>
      )}

      {/* --- Main Content --- */}
      <main 
        className="pt-32 pb-24 px-6 zoom-container"
        style={{ transform: `scale(${zoom})` }}
      >
        <div className="max-w-7xl mx-auto space-y-16">
          {/* Project Name Input */}
          <div className="text-center space-y-8">
            <div className="relative inline-block w-full max-w-2xl">
              <input 
                type="text"
                value={state.projectName}
                onChange={(e) => set({ ...state, projectName: e.target.value.toUpperCase() })}
                placeholder="NHẬP TÊN DỰ ÁN TẠI ĐÂY"
                className={`w-full bg-transparent text-center text-5xl font-black tracking-tighter focus:outline-none transition-all ${
                  state.projectName ? 'text-gradient' : 'text-white/20'
                }`}
              />
              <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-primary/30 to-transparent mt-2" />
            </div>

            <div className="max-w-3xl mx-auto glass p-6 rounded-2xl space-y-4">
              <div className="flex items-center gap-3 mb-2">
                <ImageIcon className="text-primary" size={20} />
                <h3 className="font-bold uppercase tracking-wider text-sm">Prompt mô tả phong cách</h3>
              </div>
              <textarea 
                value={state.stylePrompt}
                onChange={(e) => set({ ...state, stylePrompt: e.target.value })}
                placeholder="Nhập phong cách chung cho toàn bộ ảnh (ví dụ: anime, realistic, 3D render...)"
                className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-sm focus:outline-none focus:border-primary transition-colors resize-none h-24"
              />
            </div>
          </div>

          {/* Character Management */}
          <section className="space-y-8">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 primary-gradient rounded-2xl flex items-center justify-center shadow-lg shadow-primary/20">
                <ImageIcon className="text-white" size={24} />
              </div>
              <div>
                <h2 className="text-2xl font-bold">Quản lý nhân vật</h2>
                <p className="text-sm text-neutral-500">Đồng nhất ngoại hình nhân vật xuyên suốt dự án</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {state.characters.map(char => (
                <CharacterCard 
                  key={char.id} 
                  character={char} 
                  onUpdate={(updates) => updateCharacter(char.id, updates)}
                  onSetDefault={() => setDefaultCharacter(char.id)}
                />
              ))}
            </div>

            <div className="max-w-3xl glass p-6 rounded-2xl space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FileArchive className="text-primary" size={20} />
                  <h3 className="font-bold uppercase tracking-wider text-sm">Lưu ý cho prompt tạo video</h3>
                </div>
                <button 
                  onClick={refineVideoNote}
                  disabled={isRefiningNote || !state.videoPromptNote}
                  className="text-[10px] text-primary font-bold hover:underline disabled:opacity-50 flex items-center gap-1"
                >
                  {isRefiningNote ? <Loader2 className="animate-spin" size={10} /> : <RefreshCw size={10} />}
                  Wording lại bằng AI
                </button>
              </div>
              <textarea 
                value={state.videoPromptNote}
                onChange={(e) => set({ ...state, videoPromptNote: e.target.value })}
                placeholder="Không có nhạc nền, chỉ sử dụng âm thanh môi trường nếu cần. Nhân vật chỉ hành động minh họa cho kịch bản chứ không có nhép miệng theo lời thoại."
                className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-sm focus:outline-none focus:border-primary transition-colors resize-none h-24"
              />
            </div>
          </section>

          {/* Script Table */}
          <section className="space-y-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 primary-gradient rounded-2xl flex items-center justify-center shadow-lg shadow-primary/20">
                  <Plus className="text-white" size={24} />
                </div>
                <div>
                  <h2 className="text-2xl font-bold">Kịch bản phân cảnh</h2>
                  <p className="text-sm text-neutral-500">Quản lý các phân đoạn và tạo ảnh minh họa</p>
                </div>
              </div>
              <div className="flex gap-4">
                <button 
                  onClick={generateAllVideoPrompts}
                  disabled={isGeneratingAllVideo || state.scenes.length === 0}
                  className="flex items-center gap-2 px-6 py-3 glass rounded-xl font-bold hover:bg-white/5 transition-all text-primary border-primary/20 disabled:opacity-50"
                >
                  {isGeneratingAllVideo ? <Loader2 className="animate-spin" /> : <RefreshCw size={18} />}
                  Tạo prompt video hàng loạt
                </button>
                <button 
                  onClick={() => excelInputRef.current?.click()}
                  className="flex items-center gap-2 px-6 py-3 glass rounded-xl font-bold hover:bg-white/5 transition-all text-primary border-primary/20"
                >
                  <Upload size={18} />
                  Upload Script (Excel)
                </button>
                <button 
                  onClick={downloadAllAsZip}
                  className="flex items-center gap-2 px-6 py-3 glass rounded-xl font-bold hover:bg-white/5 transition-all"
                >
                  <FileArchive size={18} />
                  Download Full (ZIP)
                </button>
                <button 
                  onClick={generateAll}
                  disabled={isGeneratingAll || state.scenes.length === 0}
                  className="flex items-center gap-2 px-6 py-3 primary-gradient rounded-xl font-bold hover:brightness-110 transition-all shadow-xl shadow-primary/20 disabled:opacity-50"
                >
                  {isGeneratingAll ? <Loader2 className="animate-spin" /> : <RefreshCw size={18} />}
                  Tạo ảnh hàng loạt
                </button>
                <button 
                  onClick={addScene}
                  className="flex items-center gap-2 px-6 py-3 primary-gradient rounded-xl font-bold hover:brightness-110 transition-all shadow-xl shadow-primary/20"
                >
                  <Plus size={18} />
                  Thêm Phân đoạn
                </button>
              </div>
            </div>

            <div className="glass rounded-3xl overflow-hidden">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-white/5 border-b border-white/10">
                    <th className="px-4 py-4 text-left text-xs font-bold text-neutral-400 uppercase tracking-widest w-24">
                      <div className="flex items-center gap-1">
                        Scene
                        <div className="group relative">
                          <Info size={12} className="cursor-help text-neutral-600" />
                          <div className="absolute bottom-full left-0 mb-2 w-48 p-2 bg-black text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 normal-case font-normal">
                            Số thứ tự phân cảnh. Khi tải ảnh, tên file sẽ giống ô này.
                          </div>
                        </div>
                      </div>
                    </th>
                    <th className="px-4 py-4 text-left text-xs font-bold text-neutral-400 uppercase tracking-widest">Ngôn ngữ 1</th>
                    <th className="px-4 py-4 text-left text-xs font-bold text-neutral-400 uppercase tracking-widest">Tiếng Việt</th>
                    <th className="px-4 py-4 text-left text-xs font-bold text-neutral-400 uppercase tracking-widest">
                      <div className="flex items-center gap-1">
                        Tên Prompt
                        <div className="group relative">
                          <Info size={12} className="cursor-help text-neutral-600" />
                          <div className="absolute bottom-full left-0 mb-2 w-48 p-2 bg-black text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 normal-case font-normal">
                            Tóm tắt những gì xảy ra trong phân cảnh này để check tính chính xác của ảnh.
                          </div>
                        </div>
                      </div>
                    </th>
                    <th className="px-4 py-4 text-left text-xs font-bold text-neutral-400 uppercase tracking-widest">Mô tả bối cảnh</th>
                    <th className="px-4 py-4 text-left text-xs font-bold text-neutral-400 uppercase tracking-widest w-40">Nhân vật</th>
                    <th className="px-4 py-4 text-left text-xs font-bold text-neutral-400 uppercase tracking-widest">Prompt Video</th>
                    <th className="px-4 py-4 text-center text-xs font-bold text-neutral-400 uppercase tracking-widest w-40">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {state.scenes.map((scene, idx) => (
                    <React.Fragment key={scene.id}>
                      <tr className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-4 align-top">
                        <input 
                          type="text"
                          value={scene.stt}
                          onChange={(e) => updateScene(scene.id, { stt: e.target.value })}
                          className="w-full bg-transparent text-primary font-black text-lg focus:outline-none"
                        />
                      </td>
                      <td className="px-4 py-4 align-top">
                        <textarea 
                          value={scene.lang1}
                          onChange={(e) => updateScene(scene.id, { lang1: e.target.value })}
                          className="w-full bg-transparent focus:outline-none resize-none h-20 text-xs leading-relaxed"
                          placeholder="..."
                        />
                      </td>
                      <td className="px-4 py-4 align-top">
                        <textarea 
                          value={scene.vietnamese}
                          onChange={(e) => updateScene(scene.id, { vietnamese: e.target.value })}
                          className="w-full bg-transparent focus:outline-none resize-none h-20 text-xs leading-relaxed"
                          placeholder="..."
                        />
                      </td>
                      <td className="px-4 py-4 align-top">
                        <textarea 
                          value={scene.promptName}
                          onChange={(e) => updateScene(scene.id, { promptName: e.target.value })}
                          className="w-full bg-transparent focus:outline-none resize-none h-20 text-xs leading-relaxed font-medium text-neutral-300"
                          placeholder="..."
                        />
                      </td>
                      <td className="px-4 py-4 align-top">
                        <textarea 
                          value={scene.contextDescription}
                          onChange={(e) => updateScene(scene.id, { contextDescription: e.target.value })}
                          className="w-full bg-transparent focus:outline-none resize-none h-20 text-xs leading-relaxed italic text-neutral-400"
                          placeholder="..."
                        />
                      </td>
                      <td className="px-4 py-4 align-top">
                        <button 
                          onClick={() => setActiveSelectorSceneId(scene.id)}
                          className="w-full flex flex-wrap gap-1 p-2 rounded-xl bg-white/5 border border-white/10 hover:border-primary/30 transition-all min-h-[40px]"
                        >
                          {scene.selectedCharacterIds.length > 0 ? (
                            scene.selectedCharacterIds.map(cid => {
                              const char = state.characters.find(c => c.id === cid);
                              return (
                                <div key={cid} className="w-8 h-8 rounded-full border border-neutral-800 bg-neutral-800 overflow-hidden" title={char?.name}>
                                  {char?.images[0] ? <img src={char.images[0]} className="w-full h-full object-cover" /> : <ImageIcon className="m-auto text-neutral-600" size={12} />}
                                </div>
                              );
                            })
                          ) : (
                            <div className="text-[10px] text-neutral-500 italic m-auto">None</div>
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <div className="flex flex-col gap-2">
                          <textarea 
                            value={scene.videoPrompt || ''}
                            onChange={(e) => updateScene(scene.id, { videoPrompt: e.target.value })}
                            className="w-full bg-white/5 border border-white/10 rounded-xl p-2 text-[10px] focus:outline-none focus:border-primary transition-colors resize-none h-20"
                            placeholder="Prompt video sẽ xuất hiện tại đây..."
                          />
                          <button 
                            onClick={() => generateVideoPrompt(idx)}
                            disabled={scene.isVideoGenerating}
                            className="text-[10px] text-primary font-bold hover:underline flex items-center gap-1 disabled:opacity-50"
                          >
                            {scene.isVideoGenerating ? <Loader2 className="animate-spin" size={10} /> : <RefreshCw size={10} />}
                            Tạo Prompt Video
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <div className="flex flex-col items-center gap-2">
                          {scene.imageHistory.length > 0 ? (
                            <div className="relative group/thumb w-full aspect-video rounded-lg overflow-hidden glass">
                              <img src={scene.imageHistory[scene.primaryImageIndex]} className="w-full h-full object-cover" />
                              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                <button 
                                  onClick={() => setFullViewIndex(idx)}
                                  className="p-2 bg-white/10 rounded-full hover:bg-primary transition-colors"
                                  title="Xem chi tiết & Lịch sử"
                                >
                                  <Maximize2 size={14} />
                                </button>
                                <button 
                                  onClick={() => {
                                    const url = scene.imageHistory[scene.primaryImageIndex];
                                    const link = document.createElement('a');
                                    link.href = url;
                                    link.download = `scene-${scene.stt}.png`;
                                    link.click();
                                  }}
                                  className="p-2 bg-white/10 rounded-full hover:bg-primary transition-colors"
                                  title="Tải ảnh chính"
                                >
                                  <Download size={14} />
                                </button>
                                <button 
                                  onClick={() => generateImage(idx)}
                                  className="p-2 bg-white/10 rounded-full hover:bg-primary transition-colors"
                                  title="Tạo phiên bản mới"
                                >
                                  <RefreshCw size={14} />
                                </button>
                              </div>
                              {scene.imageHistory.length > 1 && (
                                <div className="absolute bottom-1 right-1 bg-black/60 backdrop-blur-md px-1.5 py-0.5 rounded text-[8px] font-bold text-white flex items-center gap-1">
                                  <History size={8} />
                                  {scene.imageHistory.length}
                                </div>
                              )}
                            </div>
                          ) : (
                            <button 
                              onClick={() => generateImage(idx)}
                              disabled={scene.isGenerating}
                              className="w-full primary-gradient py-2 rounded-xl font-bold text-[10px] flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                              {scene.isGenerating ? <Loader2 className="animate-spin" size={12} /> : <ImageIcon size={12} />}
                              {scene.isGenerating ? 'Đang tạo...' : 'Tạo ảnh'}
                            </button>
                          )}
                          <button 
                            onClick={() => set({ ...state, scenes: state.scenes.filter(s => s.id !== scene.id) })}
                            className="text-[10px] text-red-500/50 hover:text-red-500 uppercase tracking-widest font-bold transition-colors"
                          >
                            Xóa
                          </button>
                        </div>
                      </td>
                    </tr>
                    {/* Cost Info Row */}
                    {(scene.isGenerating || scene.costInfo) && (
                      <tr className="bg-primary/5 border-b border-white/5">
                        <td colSpan={7} className="px-6 py-2">
                          <div className="flex items-center justify-between text-[10px]">
                            <div className="flex items-center gap-4">
                              <span className="text-neutral-500 font-bold uppercase">Model: Gemini 2.5 Flash</span>
                              <div className="flex items-center gap-2">
                                <span className="text-neutral-400">Dự kiến:</span>
                                <span className="text-white">In: {scene.costInfo?.estimated.input.toLocaleString()}</span>
                                <span className="text-white">Out: {scene.costInfo?.estimated.output.toLocaleString()}</span>
                                <span className="text-primary font-bold">${scene.costInfo?.estimated.cost.toFixed(5)}</span>
                              </div>
                            </div>
                            {scene.costInfo?.actual && (
                              <div className="flex items-center gap-4 border-l border-white/10 pl-4">
                                <div className="flex items-center gap-2">
                                  <span className="text-neutral-400">Thực tế:</span>
                                  <span className="text-white">In: {scene.costInfo.actual.input.toLocaleString()}</span>
                                  <span className="text-white">Out: {scene.costInfo.actual.output.toLocaleString()}</span>
                                  <span className="text-primary font-bold">${scene.costInfo.actual.cost.toFixed(5)}</span>
                                </div>
                                <div className={`font-bold ${scene.costInfo.actual.diffPercent > 0 ? 'text-red-400' : 'text-green-400'}`}>
                                  {scene.costInfo.actual.diffPercent > 0 ? '+' : ''}{scene.costInfo.actual.diffPercent.toFixed(1)}%
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
              </table>
              {state.scenes.length === 0 && (
                <div className="py-20 text-center text-neutral-500 italic">
                  Chưa có phân cảnh nào. Hãy ấn "Thêm Phân đoạn" để bắt đầu.
                </div>
              )}
            </div>
          </section>

          {/* Placeholder Section */}
          <div className="glass rounded-[2rem] p-12 text-center space-y-8 relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary to-transparent opacity-50" />
            
            <div className="space-y-4">
              <h3 className="text-2xl font-bold">Sẽ được cập nhật sau</h3>
              <p className="text-neutral-400 max-w-md mx-auto leading-relaxed">
                Các tính năng mở rộng đang được phát triển. Hãy quay trở lại trang hướng dẫn để cập nhật thêm thông tin.
              </p>
            </div>

            <div className="flex flex-col items-center gap-6">
              <div className="p-6 bg-white/5 rounded-2xl border border-white/10 w-full max-w-lg">
                <div className="flex items-center gap-3 mb-4 text-primary">
                  <Info size={20} />
                  <span className="font-bold uppercase tracking-wider text-sm">Hướng dẫn</span>
                </div>
                <p className="text-sm text-neutral-300 mb-6">
                  Bạn có thể quay trở lại trang Prompt App của Xizital để bổ sung thêm chức năng cho ứng dụng này.
                </p>
                <a 
                  href="https://xizital.com/prompt-tao-app-bang-google-ai-studio/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-6 py-3 primary-gradient rounded-xl font-bold text-sm hover:scale-105 transition-transform shadow-xl shadow-primary/20"
                >
                  Prompt App <ExternalLink size={16} />
                </a>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* --- Footer --- */}
      <footer className="py-12 border-t border-white/5 text-center">
        <p className="text-neutral-500 text-sm">
          Prompting by <a href="https://xizital.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-semibold">Xizital</a>
        </p>
      </footer>

      {/* --- Floating Bubble --- */}
      <div className="fixed bottom-8 right-8 z-[60]">
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => setIsCoffeeModalOpen(true)}
          className="w-16 h-16 primary-gradient rounded-full shadow-2xl shadow-primary/40 flex items-center justify-center group relative"
        >
          <Coffee size={28} className="text-white group-hover:rotate-12 transition-transform" />
          <div className="absolute right-full mr-4 px-4 py-2 glass rounded-xl text-xs font-bold whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            {bubbleText}
          </div>
        </motion.button>
      </div>

      {/* --- Modals --- */}
      <ApiKeyModal 
        isOpen={isApiKeyModalOpen} 
        onClose={() => setIsApiKeyModalOpen(false)} 
        apiKey={apiKey} 
        setApiKey={setApiKey} 
      />
      <CoffeeModal 
        isOpen={isCoffeeModalOpen} 
        onClose={() => setIsCoffeeModalOpen(false)} 
        bubbleText={bubbleText}
      />
      <CharacterSelector 
        isOpen={!!activeSelectorSceneId}
        onClose={() => setActiveSelectorSceneId(null)}
        characters={state.characters}
        selectedIds={state.scenes.find(s => s.id === activeSelectorSceneId)?.selectedCharacterIds || []}
        onToggle={(cid) => activeSelectorSceneId && toggleCharacterInScene(activeSelectorSceneId, cid)}
      />
      {fullViewIndex !== null && (
        <FullImageViewer 
          scenes={state.scenes}
          currentIndex={fullViewIndex}
          onClose={() => setFullViewIndex(null)}
          onNavigate={(dir) => setFullViewIndex(prev => prev !== null ? (dir === 'prev' ? Math.max(0, prev - 1) : Math.min(state.scenes.length - 1, prev + 1)) : null)}
          onRegenerate={(idx, prompt) => generateImage(idx, prompt)}
          onSetPrimary={(sIdx, iIdx) => {
            const updatedScenes = [...state.scenes];
            updatedScenes[sIdx] = { ...updatedScenes[sIdx], primaryImageIndex: iIdx };
            set({ ...state, scenes: updatedScenes });
          }}
        />
      )}

      {/* Hidden File Input */}
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={onFileChange} 
        accept=".json" 
        className="hidden" 
      />
      <input 
        type="file" 
        ref={excelInputRef} 
        onChange={handleExcelUpload} 
        accept=".xlsx, .xls" 
        className="hidden" 
      />
    </div>
  );
}
