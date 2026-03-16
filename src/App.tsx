/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from "@google/genai";

const WEBHOOK_URL = import.meta.env.VITE_GOOGLE_SHEETS_WEBHOOK_URL;
import { 
  UserCircle, 
  PlusCircle, 
  Send, 
  MessageCircle, 
  CheckCircle2, 
  Users, 
  Loader2,
  Phone,
  User as UserIcon,
  FileText,
  AlertCircle,
  Camera,
  X,
  Image as ImageIcon,
  RefreshCw,
  Download,
  Wifi,
  WifiOff,
  Settings,
  ChevronRight,
  MapPin,
  Trash2,
  LogOut,
  Lock
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Product categories
const ELECTRICAL_SUBCATEGORIES = [
  "Transformer",
  "Switch gear",
  "Transmission",
  "Switches",
  "Pannel Board"
];

const PRODUCT_CATEGORIES = [
  "Electrical products",
  "Precision Brass Components",
  "Brass Valve",
  "Brass Fasteners",
  "Brass Hardware Components",
  "Brass Fitting Parts",
  "Decorative Metal Parts",
  "Brass Auto Components",
  "Brass Table Flag Stand",
  "Other / Custom Requirement"
];

const STAFF_NAMES = [
  "Jeet Mehta",
  "Kapil Dave",
  "Sanjay Vekariya",
  "Narendra Kanjariya",
  "Pankaj Bhai",
  "Deepak Ganerkar",
  "Dixit Kanjariya",
  "Bhargav Chandani",
  "Neet Kanjariya"
];

const VALID_USERS: Record<string, string> = {
  "7600797600": "7600",
  "9408324979": "4979",
  "9898968899": "8899",
  "9763587408": "7408",
  "9313059478": "9478",
  "9904082019": "2019",
  "9023030868": "0868",
  "9033887788": "7788"
};

const getISTDateTime = () => {
  return new Date().toLocaleString('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
};

interface Lead {
  id?: string;
  rowIndex?: number;
  name: string;
  mobile: string;
  city: string;
  inquiry: string;
  notes?: string;
  cardImage?: string;
  staffName: string;
  createdAt: any;
}

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginId, setLoginId] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [lastSavedLead, setLastSavedLead] = useState<Lead | null>(null);
  const [recentLeads, setRecentLeads] = useState<Lead[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [leadToDelete, setLeadToDelete] = useState<Lead | null>(null);
  const [view, setView] = useState<'form' | 'success' | 'list'>('form');
  const [showCamera, setShowCamera] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isProcessingOCR, setIsProcessingOCR] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const ocrRequestIdRef = useRef<number>(0);
  const [pendingLeads, setPendingLeads] = useState<Lead[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [editingLeadId, setEditingLeadId] = useState<string | null>(null);
  const [previewLead, setPreviewLead] = useState<Lead | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    mobile: '',
    city: '',
    inquiry: PRODUCT_CATEGORIES[0],
    subInquiry: ELECTRICAL_SUBCATEGORIES[0],
    notes: '',
    cardImage: '',
    staffName: STAFF_NAMES[0]
  });

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    // Load pending leads
    const saved = localStorage.getItem('paani_pending_leads');
    if (saved) setPendingLeads(JSON.parse(saved));

    // Check login status
    const loggedIn = localStorage.getItem('paani_logged_in');
    if (loggedIn === 'true') {
      setIsLoggedIn(true);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (isOnline && pendingLeads.length > 0) {
      syncOfflineLeads();
    }
  }, [isOnline, pendingLeads]);

  const syncOfflineLeads = async () => {
    if (isSyncing || !WEBHOOK_URL) return;
    setIsSyncing(true);
    const toSync = [...pendingLeads];
    for (const lead of toSync) {
      try {
        await fetch(WEBHOOK_URL, {
          method: 'POST',
          mode: 'no-cors',
          headers: {
            'Content-Type': 'text/plain',
          },
          body: JSON.stringify({ action: 'add', ...lead })
        });
      } catch (err) {
        console.error("Sync error:", err);
      }
    }
    setPendingLeads([]);
    localStorage.removeItem('paani_pending_leads');
    setIsSyncing(false);
    fetchLeads();
  };

  useEffect(() => {
    setLoading(false);
  }, []);

  const fetchLeads = async () => {
    if (!WEBHOOK_URL) return;
    try {
      const res = await fetch(WEBHOOK_URL);
      const data = await res.json();
      
      if (Array.isArray(data)) {
        let normalizedData: Lead[] = [];
        
        // Handle array of arrays (e.g., raw sheet data where first row is headers)
        if (data.length > 0 && Array.isArray(data[0])) {
          const headers = data[0].map((h: string) => h?.toString().toLowerCase().replace(/[^a-z0-9]/g, ''));
          
          normalizedData = data.slice(1).map((row: any[], index: number) => {
            const getVal = (possibleKeys: string[]) => {
              const index = headers.findIndex((h: string) => possibleKeys.includes(h));
              return index !== -1 ? row[index] : '';
            };
            
            return {
              id: getVal(['id', 'uuid', 'recordid']) || `row-${index + 2}`,
              rowIndex: index + 2,
              name: getVal(['name', 'visitorname', 'visitor', 'fullname']),
              mobile: getVal(['mobile', 'mobilenumber', 'phone', 'phonenumber', 'contact']),
              city: getVal(['city', 'location', 'address']),
              inquiry: getVal(['inquiry', 'productinterest', 'product', 'category']),
              notes: getVal(['notes', 'additionalnotes', 'remarks']),
              cardImage: getVal(['cardimage', 'image', 'card', 'photo']),
              staffName: getVal(['staffname', 'staffmember', 'staff', 'employee']),
              createdAt: getVal(['createdat', 'date', 'timestamp', 'time']) || getISTDateTime()
            };
          });
        } 
        // Handle array of objects
        else if (data.length > 0 && typeof data[0] === 'object') {
          normalizedData = data.map((row: any, index: number) => {
            // If the object already perfectly matches our Lead interface
            if (row.name !== undefined && row.mobile !== undefined && row.staffName !== undefined) {
              return {
                ...row,
                id: row.id || `row-${index + 2}`,
                rowIndex: row.rowIndex || index + 2
              } as Lead;
            }
            
            const getValue = (possibleKeys: string[]) => {
              const key = Object.keys(row).find(k => 
                possibleKeys.some(pk => k.toLowerCase().replace(/[^a-z0-9]/g, '') === pk)
              );
              return key ? row[key] : '';
            };

            return {
              id: getValue(['id', 'uuid', 'recordid']) || `row-${index + 2}`,
              rowIndex: index + 2,
              name: getValue(['name', 'visitorname', 'visitor', 'fullname']),
              mobile: getValue(['mobile', 'mobilenumber', 'phone', 'phonenumber', 'contact']),
              city: getValue(['city', 'location', 'address']),
              inquiry: getValue(['inquiry', 'productinterest', 'product', 'category']),
              notes: getValue(['notes', 'additionalnotes', 'remarks']),
              cardImage: getValue(['cardimage', 'image', 'card', 'photo']),
              staffName: getValue(['staffname', 'staffmember', 'staff', 'employee']),
              createdAt: getValue(['createdat', 'date', 'timestamp', 'time']) || getISTDateTime()
            };
          });
        }
        
        // Filter out completely empty rows that might come from empty spreadsheet rows
        const validLeads = normalizedData.filter(lead => lead.name || lead.mobile || lead.staffName);
        
        // Sort by date descending (newest first)
        validLeads.sort((a, b) => {
          const dateA = new Date(a.createdAt).getTime();
          const dateB = new Date(b.createdAt).getTime();
          return (isNaN(dateB) ? 0 : dateB) - (isNaN(dateA) ? 0 : dateA);
        });
        
        setRecentLeads(validLeads);
      }
    } catch (err) {
      console.error("Fetch error:", err);
    }
  };

  useEffect(() => {
    fetchLeads();
    // Poll every 30 seconds for updates
    const interval = setInterval(fetchLeads, 30000);
    return () => clearInterval(interval);
  }, []);

  const resetForm = () => {
    ocrRequestIdRef.current++; // Cancel any pending OCR
    setIsProcessingOCR(false);
    setEditingLeadId(null);
    
    // Ensure staffName is valid
    const validStaffName = STAFF_NAMES.includes(formData.staffName) 
      ? formData.staffName 
      : STAFF_NAMES[0];
      
    setFormData({
      name: '',
      mobile: '',
      city: '',
      inquiry: PRODUCT_CATEGORIES[0],
      subInquiry: ELECTRICAL_SUBCATEGORIES[0],
      notes: '',
      cardImage: '',
      staffName: validStaffName
    });
  };

  const handleEditLead = (lead: Lead) => {
    setEditingLeadId(lead.id || null);
    
    // Ensure staffName is valid, otherwise fallback to first staff member
    const validStaffName = STAFF_NAMES.includes(lead.staffName) 
      ? lead.staffName 
      : STAFF_NAMES[0];
      
    let inquiry = lead.inquiry;
    let subInquiry = ELECTRICAL_SUBCATEGORIES[0];
    if (inquiry.startsWith('Electrical products - ')) {
      subInquiry = inquiry.replace('Electrical products - ', '');
      inquiry = 'Electrical products';
    } else if (inquiry === 'Electrical products') {
      subInquiry = ELECTRICAL_SUBCATEGORIES[0];
    }
      
    setFormData({
      name: lead.name,
      mobile: lead.mobile,
      city: lead.city || '',
      inquiry: inquiry,
      subInquiry: subInquiry,
      notes: lead.notes || '',
      cardImage: lead.cardImage || '',
      staffName: validStaffName
    });
    setView('form');
  };

  const startCamera = async () => {
    setShowCamera(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' }, 
        audio: false 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Camera error:", err);
      setError("Could not access camera. Please check permissions.");
      setShowCamera(false);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
    }
    setShowCamera(false);
  };

  const compressImage = (base64Str: string, maxWidth = 1024, quality = 0.5): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64Str;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = (maxWidth / width) * height;
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsCompressing(true);
    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64 = event.target?.result as string;
        const compressed = await compressImage(base64);
        setFormData({ ...formData, cardImage: compressed });
        handleOCR(compressed);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error("Upload error:", err);
      setError("Failed to process image.");
    } finally {
      setIsCompressing(false);
    }
  };

  const capturePhoto = async () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');

      if (context) {
        // Capture at high res first
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const rawData = canvas.toDataURL('image/jpeg', 0.9);
        
        stopCamera();
        setIsCompressing(true);
        
        // Then compress
        const compressedData = await compressImage(rawData, 1024, 0.5);
        setFormData({ ...formData, cardImage: compressedData });
        setIsCompressing(false);

        // Start OCR
        handleOCR(compressedData);
      }
    }
  };

  const handleOCR = async (base64Image: string) => {
    if (!process.env.GEMINI_API_KEY) {
      console.warn("Gemini API Key missing. OCR skipped.");
      return;
    }
    
    const requestId = ++ocrRequestIdRef.current;
    setIsProcessingOCR(true);
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: {
          parts: [
            { text: "Extract the Visitor's Name, Mobile Number, and City from this business card. Return ONLY a valid JSON object like: { \"name\": \"...\", \"mobile\": \"...\", \"city\": \"...\" }. If a field is not found, use an empty string. Do not include any other text or markdown formatting." },
            { inlineData: { data: base64Image.split(',')[1], mimeType: "image/jpeg" } }
          ]
        }
      });
      
      if (requestId !== ocrRequestIdRef.current) return; // Cancelled
      
      const text = response.text;
      if (text) {
        const cleanJson = text.replace(/```json|```/g, '').trim();
        try {
          const data = JSON.parse(cleanJson);
          setFormData(prev => ({
            ...prev,
            name: prev.name || data.name || '',
            mobile: prev.mobile || data.mobile || '',
            city: prev.city || data.city || ''
          }));
        } catch (e) {
          console.error("JSON Parse Error:", e, text);
        }
      }
    } catch (err) {
      if (requestId === ocrRequestIdRef.current) {
        console.error("OCR Error:", err);
      }
    } finally {
      if (requestId === ocrRequestIdRef.current) {
        setIsProcessingOCR(false);
      }
    }
  };

  const cancelOCR = () => {
    ocrRequestIdRef.current++;
    setIsProcessingOCR(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Mobile number validation: exactly 10 digits
    const mobileRegex = /^\d{10}$/;
    if (!mobileRegex.test(formData.mobile)) {
      setError("Mobile number must be exactly 10 digits.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const finalInquiry = formData.inquiry === 'Electrical products' 
        ? `Electrical products - ${formData.subInquiry}`
        : formData.inquiry;

      const leadData: Lead = {
        id: editingLeadId || crypto.randomUUID(),
        name: formData.name,
        mobile: formData.mobile,
        city: formData.city,
        inquiry: finalInquiry,
        notes: formData.notes,
        cardImage: formData.cardImage,
        staffName: formData.staffName,
        createdAt: editingLeadId ? (recentLeads.find(l => l.id === editingLeadId)?.createdAt || getISTDateTime()) : getISTDateTime()
      };

      if (isOnline) {
        if (!WEBHOOK_URL) {
          setError("Google Sheets Webhook URL is not configured. Please add it in settings.");
          setSubmitting(false);
          return;
        }
        
        await fetch(WEBHOOK_URL, {
          method: 'POST',
          mode: 'no-cors',
          headers: {
            'Content-Type': 'text/plain',
          },
          body: JSON.stringify({ 
            action: editingLeadId ? 'update' : 'add', 
            originalMobile: editingLeadId ? recentLeads.find(l => l.id === editingLeadId)?.mobile : undefined,
            ...leadData 
          })
        });
        
        setLastSavedLead(leadData);
        fetchLeads(); // Refresh list
      } else {
        if (editingLeadId) {
          setError("Editing is only available while online.");
          setSubmitting(false);
          return;
        }
        const newPending = [...pendingLeads, leadData];
        setPendingLeads(newPending);
        localStorage.setItem('paani_pending_leads', JSON.stringify(newPending));
        setLastSavedLead(leadData);
      }

      resetForm();
      setView('success');
    } catch (err) {
      console.error("Submit error:", err);
      setError("Failed to save lead. Please check your connection.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteLead = async (lead: Lead, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent opening the edit view
    setLeadToDelete(lead);
  };

  const executeDelete = async () => {
    if (!leadToDelete) return;
    const lead = leadToDelete;
    setLeadToDelete(null); // Close modal

    if (!isOnline) {
      setError("Deleting records is only available while online.");
      return;
    }

    if (!WEBHOOK_URL) {
      setError("Google Sheets Webhook URL is not configured.");
      return;
    }

    try {
      // Optimistically remove from UI
      setRecentLeads(prev => prev.filter(l => l.id !== lead.id));
      
      await fetch(WEBHOOK_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'text/plain',
        },
        body: JSON.stringify({ 
          action: 'delete', 
          id: lead.id,
          mobile: lead.mobile // Fallback identifier
        })
      });
      
      fetchLeads(); // Refresh list to ensure sync
    } catch (err) {
      console.error("Delete error:", err);
      setError("Failed to delete lead. Please try again.");
      fetchLeads(); // Revert optimistic update on failure
    }
  };

  const shareOnWhatsApp = () => {
    if (!lastSavedLead) return;

    const message = `*Namaste ${lastSavedLead.name}!* 🙏\n\nIt was a pleasure meeting you at our exhibition booth today! 😊\n\nAt Paani Precision Products LLP, we are committed to delivering excellence in technology. 💧⚙️\n\nAs discussed, you can explore our complete product range and digital catalog here:\n👉 https://sites.google.com/view/paaniprecisionqr\n\nWe look forward to a fruitful association with you. 🤝\n\n*Best Regards,*\nPaani Precision Products LLP.\nS.R. No. 53, Plot No. 5/B-1 &\n5/B-2, Raj Rajeshwari Estate,\nPrivate Zone, Kansumra Road,\nNear Apna Rajdhani Hotel,\nKansumra, Jamnagar - 361001,\nGujarat, India.\n\n+91-9408324979\nhttps://www.paaniprecisions.com/\ninfo@paaniprecisions.com`;
    
    // Clean mobile number (remove non-digits)
    let cleanMobile = lastSavedLead.mobile.replace(/\D/g, '');
    
    // Automatically prepend 91 for 10-digit Indian numbers
    if (cleanMobile.length === 10) {
      cleanMobile = `91${cleanMobile}`;
    }
    
    const whatsappUrl = `https://wa.me/${cleanMobile}?text=${encodeURIComponent(message)}`;
    
    window.open(whatsappUrl, '_blank');
  };

  const exportToCSV = () => {
    const headers = ["Date", "Time", "Staff", "Visitor", "Mobile", "City", "Inquiry", "Notes"];
    const rows = recentLeads.map(l => {
      const d = new Date(l.createdAt);
      const isValidDate = !isNaN(d.getTime());
      
      return [
        isValidDate ? d.toLocaleDateString() : l.createdAt,
        isValidDate ? d.toLocaleTimeString() : '',
        l.staffName,
        l.name,
        l.mobile,
        l.city || '',
        l.inquiry,
        l.notes || ''
      ];
    });
    
    const csvContent = [headers, ...rows].map(e => e.map(val => `"${val}"`).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `paani_leads_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (VALID_USERS[loginId] && VALID_USERS[loginId] === loginPassword) {
      setIsLoggedIn(true);
      localStorage.setItem('paani_logged_in', 'true');
      setLoginError('');
    } else {
      setLoginError('Invalid Mobile Number or Password');
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    localStorage.removeItem('paani_logged_in');
    setLoginId('');
    setLoginPassword('');
  };

  const GearLoader = () => (
    <div className="relative w-24 h-24">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
        className="absolute inset-0 flex items-center justify-center"
      >
        <Settings className="w-20 h-20 text-navy-200" />
      </motion.div>
      <motion.div
        animate={{ rotate: -360 }}
        transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
        className="absolute inset-0 flex items-center justify-center"
      >
        <Settings className="w-12 h-12 text-navy-500" />
      </motion.div>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-brass-500 font-black text-xl">P</span>
      </div>
    </div>
  );

  const ImagePreviewModal = ({ lead, onClose }: { lead: Lead, onClose: () => void }) => (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-navy-950/90 backdrop-blur-md"
    >
      <motion.div 
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        className="bg-white rounded-3xl overflow-hidden max-w-lg w-full shadow-2xl border border-white/20"
      >
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div>
            <h3 className="text-navy-900 font-black text-sm uppercase tracking-wider">{lead.name}</h3>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-tight">{lead.mobile}</p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 bg-slate-50 flex items-center justify-center min-h-[300px]">
          {lead.cardImage ? (
            <img 
              src={lead.cardImage} 
              className="max-w-full max-h-[60vh] object-contain rounded-xl shadow-lg border border-white" 
              alt="Visiting Card" 
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="flex flex-col items-center gap-3 text-slate-300">
              <ImageIcon className="w-16 h-16" />
              <p className="text-xs font-bold uppercase tracking-widest">No Image Available</p>
            </div>
          )}
        </div>

        <div className="p-4 bg-white border-t border-slate-100 flex gap-3">
          <button
            onClick={() => {
              handleEditLead(lead);
              onClose();
              setTimeout(() => startCamera(), 100);
            }}
            className="flex-1 bg-navy-600 text-white py-3 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-navy-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-navy-100"
          >
            <Camera className="w-4 h-4" />
            Replace Image
          </button>
          <button
            onClick={onClose}
            className="px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest text-slate-400 hover:bg-slate-50 transition-all border border-slate-100"
          >
            Close
          </button>
        </div>
      </motion.div>
    </motion.div>
  );

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
        <GearLoader />
        <p className="mt-4 text-navy-900 font-bold animate-pulse">Initializing Paani Lead System...</p>
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 selection:bg-navy-100 selection:text-navy-900">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-white rounded-[2.5rem] shadow-[0_20px_60px_rgba(15,23,42,0.05)] border border-slate-100 overflow-hidden relative"
        >
          <div className="absolute top-0 right-0 w-40 h-40 bg-navy-50 rounded-full -mr-20 -mt-20 opacity-50" />
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-brass-50 rounded-full -ml-16 -mb-16 opacity-50" />
          
          <div className="p-10 relative z-10">
            <div className="flex justify-center mb-8">
              <div className="w-20 h-20 bg-white rounded-2xl flex items-center justify-center shadow-xl border border-slate-50 overflow-hidden">
                <img 
                  src="https://www.paaniprecisions.com/images/logo.png" 
                  alt="Paani Logo" 
                  className="w-full h-full object-contain p-2"
                  referrerPolicy="no-referrer"
                />
              </div>
            </div>
            
            <div className="text-center mb-10">
              <h1 className="text-3xl font-black text-navy-900 tracking-tight mb-2">Welcome Back</h1>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Sign in to continue</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-navy-400 uppercase tracking-widest ml-1">Mobile Number</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <UserIcon className="h-5 w-5 text-slate-300" />
                  </div>
                  <input
                    type="text"
                    value={loginId}
                    onChange={(e) => setLoginId(e.target.value.replace(/\D/g, ''))}
                    className="w-full pl-11 pr-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-bold text-navy-900 focus:outline-none focus:border-navy-500 focus:ring-4 focus:ring-navy-500/10 transition-all placeholder:text-slate-300 placeholder:font-medium"
                    placeholder="Enter your mobile number"
                    maxLength={10}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-navy-400 uppercase tracking-widest ml-1">Password</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-slate-300" />
                  </div>
                  <input
                    type="password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="w-full pl-11 pr-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-bold text-navy-900 focus:outline-none focus:border-navy-500 focus:ring-4 focus:ring-navy-500/10 transition-all placeholder:text-slate-300 placeholder:font-medium"
                    placeholder="Enter your password"
                    required
                  />
                </div>
              </div>

              {loginError && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-red-50 text-red-500 text-xs font-bold p-3 rounded-xl flex items-center gap-2 border border-red-100"
                >
                  <AlertCircle className="w-4 h-4" />
                  {loginError}
                </motion.div>
              )}

              <button
                type="submit"
                className="w-full bg-navy-600 hover:bg-navy-700 text-white font-black py-4 rounded-2xl transition-all shadow-xl shadow-navy-200 flex items-center justify-center gap-2 group"
              >
                <span>Sign In</span>
                <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
            </form>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-navy-100 selection:text-navy-900">
      {/* Header */}
      <header className="bg-navy-600 text-white sticky top-0 z-30 shadow-lg shadow-navy-100">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-lg overflow-hidden">
              <img 
                src="https://www.paaniprecisions.com/images/logo.png" 
                alt="Paani Logo" 
                className="w-full h-full object-contain p-1"
                referrerPolicy="no-referrer"
              />
            </div>
            <div>
              <span className="font-black text-lg tracking-tight text-white block leading-none">Paani Precision</span>
              <span className="text-[9px] font-black text-navy-100 uppercase tracking-[0.2em]">Products LLP</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => {
                if (view === 'list') {
                  resetForm();
                  setView('form');
                } else {
                  setView('list');
                }
              }}
              className={cn(
                "px-4 py-2 rounded-xl font-black text-xs transition-all flex items-center gap-2",
                view === 'list' 
                  ? "bg-white text-navy-600 shadow-lg" 
                  : "bg-white/10 text-white hover:bg-white/20"
              )}
            >
              {view === 'list' ? (
                <>
                  <PlusCircle className="w-3.5 h-3.5" />
                  New Entry
                </>
              ) : (
                <>
                  <Users className="w-3.5 h-3.5" />
                  View Records
                </>
              )}
            </button>
            <button
              onClick={handleLogout}
              className="w-10 h-10 rounded-xl bg-white/10 text-white hover:bg-red-500 hover:text-white transition-colors flex items-center justify-center"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className={cn("mx-auto p-6 pb-32", view === 'list' ? "max-w-6xl" : "max-w-2xl")}>
        <AnimatePresence mode="wait">
          {error && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-6 bg-rose-50 border border-rose-100 text-rose-600 p-5 rounded-3xl flex items-center gap-4 shadow-sm"
            >
              <div className="bg-rose-100 p-2 rounded-full">
                <AlertCircle className="w-5 h-5" />
              </div>
              <p className="text-sm font-bold">{error}</p>
              <button onClick={() => setError(null)} className="ml-auto p-1 hover:bg-rose-100 rounded-full transition-colors">
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )}

          {view === 'form' && (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div className="bg-white rounded-[2rem] p-8 shadow-[0_20px_60px_rgba(15,23,42,0.05)] border border-slate-100">
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-2xl font-black tracking-tight flex items-center gap-3 text-navy-900">
                    <div className="w-1.5 h-8 bg-brass-500 rounded-full" />
                    {editingLeadId ? 'Edit Visitor' : 'Visitor Entry'}
                  </h2>
                  <div className="flex items-center gap-2">
                    {!isOnline && (
                      <div className="bg-rose-50 text-rose-600 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest flex items-center gap-1 border border-rose-100">
                        <WifiOff className="w-3 h-3" /> Offline
                      </div>
                    )}
                    <div className="text-[9px] font-black bg-slate-50 text-slate-500 px-3 py-1 rounded-full uppercase tracking-widest border border-slate-100">
                      Exhibition 2026
                    </div>
                  </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Staff Member</label>
                    <div className="relative group">
                      <UserCircle className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300 group-focus-within:text-navy-600 transition-colors pointer-events-none" />
                      <select 
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 pl-12 pr-4 focus:bg-white focus:border-navy-900 transition-all outline-none appearance-none font-bold text-navy-900"
                        value={formData.staffName}
                        onChange={e => setFormData({...formData, staffName: e.target.value})}
                      >
                        {STAFF_NAMES.map(name => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Visitor Name</label>
                      <div className="relative group">
                        <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300 group-focus-within:text-navy-600 transition-colors" />
                        <input 
                          type="text"
                          placeholder={isProcessingOCR ? "Scanning..." : "Full Name"}
                          className={cn(
                            "w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 pl-12 pr-4 focus:bg-white focus:border-navy-900 transition-all outline-none font-bold text-navy-900",
                            isProcessingOCR && "animate-pulse opacity-50"
                          )}
                          value={formData.name}
                          onChange={e => setFormData({...formData, name: e.target.value})}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Mobile Number</label>
                      <div className="relative group">
                        <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300 group-focus-within:text-navy-600 transition-colors" />
                        <input 
                          required
                          type="tel"
                          placeholder={isProcessingOCR ? "Scanning..." : "Mobile Number"}
                          maxLength={10}
                          className={cn(
                            "w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 pl-12 pr-4 focus:bg-white focus:border-navy-900 transition-all outline-none font-bold text-navy-900",
                            isProcessingOCR && "animate-pulse opacity-50"
                          )}
                          value={formData.mobile}
                          onChange={e => {
                            const val = e.target.value.replace(/\D/g, '');
                            if (val.length <= 10) {
                              setFormData({...formData, mobile: val});
                            }
                          }}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">City</label>
                      <div className="relative group">
                        <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300 group-focus-within:text-navy-600 transition-colors" />
                        <input 
                          type="text"
                          placeholder={isProcessingOCR ? "Scanning..." : "City"}
                          className={cn(
                            "w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 pl-12 pr-4 focus:bg-white focus:border-navy-900 transition-all outline-none font-bold text-navy-900",
                            isProcessingOCR && "animate-pulse opacity-50"
                          )}
                          value={formData.city}
                          onChange={e => setFormData({...formData, city: e.target.value})}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Product Interest</label>
                    <div className="relative group">
                      <FileText className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300 group-focus-within:text-navy-600 transition-colors pointer-events-none" />
                      <select 
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 pl-12 pr-4 focus:bg-white focus:border-navy-900 transition-all outline-none appearance-none font-bold text-navy-900"
                        value={formData.inquiry}
                        onChange={e => setFormData({...formData, inquiry: e.target.value})}
                      >
                        {PRODUCT_CATEGORIES.map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {formData.inquiry === 'Electrical products' && (
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Sub Category</label>
                      <div className="relative group">
                        <FileText className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300 group-focus-within:text-navy-600 transition-colors pointer-events-none" />
                        <select 
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 pl-12 pr-4 focus:bg-white focus:border-navy-900 transition-all outline-none appearance-none font-bold text-navy-900"
                          value={formData.subInquiry}
                          onChange={e => setFormData({...formData, subInquiry: e.target.value})}
                        >
                          {ELECTRICAL_SUBCATEGORIES.map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}

                  {/* Visiting Card Photo Section */}
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Visiting Card Photo</label>
                    
                    {!formData.cardImage ? (
                      <div className="grid grid-cols-2 gap-4">
                        <button
                          type="button"
                          onClick={startCamera}
                          className="aspect-square bg-slate-50 border border-slate-200 rounded-3xl flex flex-col items-center justify-center gap-3 hover:bg-navy-50 hover:border-navy-200 transition-all group"
                        >
                          <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform border border-slate-100">
                            <Camera className="w-6 h-6 text-slate-400 group-hover:text-navy-700" />
                          </div>
                          <div className="text-center">
                            <span className="block text-[10px] font-black text-slate-500 uppercase tracking-widest">Camera</span>
                          </div>
                        </button>

                        <label className="aspect-square bg-slate-50 border border-slate-200 rounded-3xl flex flex-col items-center justify-center gap-3 hover:bg-navy-50 hover:border-navy-200 transition-all group cursor-pointer">
                          <input 
                            type="file" 
                            accept="image/*" 
                            className="hidden" 
                            onChange={handleFileUpload}
                          />
                          <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform border border-slate-100">
                            <ImageIcon className="w-6 h-6 text-slate-400 group-hover:text-navy-700" />
                          </div>
                          <div className="text-center">
                            <span className="block text-[10px] font-black text-slate-500 uppercase tracking-widest">Gallery</span>
                          </div>
                        </label>
                      </div>
                    ) : (
                      <div className="relative rounded-3xl overflow-hidden aspect-[16/9] border border-slate-200 shadow-inner group">
                        <img src={formData.cardImage} alt="Visiting Card" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-navy-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4 backdrop-blur-sm">
                          <button 
                            type="button"
                            onClick={startCamera}
                            className="bg-white text-navy-900 p-3 rounded-full shadow-xl hover:scale-110 transition-transform"
                          >
                            <RefreshCw className="w-5 h-5" />
                          </button>
                          <button 
                            type="button"
                            onClick={() => setFormData({...formData, cardImage: ''})}
                            className="bg-rose-500 text-white p-3 rounded-full shadow-xl hover:scale-110 transition-transform"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                        {isProcessingOCR && (
                          <div className="absolute inset-0 bg-navy-950/40 backdrop-blur-sm flex flex-col items-center justify-center text-white">
                            <GearLoader />
                            <p className="mt-2 text-[10px] font-black uppercase tracking-widest">Scanning Card...</p>
                            <button 
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                cancelOCR();
                              }}
                              className="mt-4 px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white text-[10px] font-black uppercase tracking-widest rounded-full transition-colors shadow-lg"
                            >
                              Cancel Scan
                            </button>
                          </div>
                        )}
                        {isCompressing && (
                          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm flex flex-col items-center justify-center text-white">
                            <Loader2 className="w-8 h-8 animate-spin" />
                            <p className="mt-2 text-[10px] font-black uppercase tracking-widest">Optimizing...</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Additional Notes</label>
                    <textarea 
                      placeholder="Specific requirements, quantity, timeline..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 px-6 focus:bg-white focus:border-navy-900 transition-all outline-none min-h-[100px] font-bold text-navy-900 resize-none"
                      value={formData.notes}
                      onChange={e => setFormData({...formData, notes: e.target.value})}
                    />
                  </div>

                  <button
                    disabled={submitting}
                    type="submit"
                    className="w-full bg-navy-600 hover:bg-navy-700 text-white font-black py-5 rounded-2xl transition-all flex items-center justify-center gap-4 disabled:opacity-50 shadow-xl shadow-navy-100 mt-4 relative overflow-hidden group"
                  >
                    <motion.div
                      className="absolute inset-0 bg-white/10 -skew-x-12"
                      animate={{ x: ['-100%', '200%'] }}
                      transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                    />
                    {submitting ? <Loader2 className="w-6 h-6 animate-spin" /> : <Send className="w-6 h-6" />}
                    <span className="relative z-10 tracking-tight text-lg uppercase tracking-widest">{editingLeadId ? 'Update Visitor Record' : 'Save Visitor Record'}</span>
                  </button>

                  <div className="pt-4 flex items-center justify-center">
                    <button
                      type="button"
                      onClick={() => {
                        resetForm();
                        setView('list');
                      }}
                      className="text-[10px] font-black text-navy-400 uppercase tracking-[0.2em] hover:text-navy-700 transition-colors flex items-center gap-2"
                    >
                      <Users className="w-3 h-3" />
                      View All Entries
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          )}

          {view === 'success' && (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="text-center space-y-10 py-10"
            >
              <div className="flex flex-col items-center">
                <motion.div 
                  initial={{ rotate: -10, scale: 0 }}
                  animate={{ rotate: 0, scale: 1 }}
                  transition={{ type: 'spring', damping: 12 }}
                  className="w-24 h-24 bg-gradient-to-tr from-emerald-400 to-teal-400 rounded-[2rem] flex items-center justify-center mb-8 shadow-2xl shadow-emerald-200"
                >
                  <CheckCircle2 className="w-14 h-14 text-white" />
                </motion.div>
                <h2 className="text-4xl font-black text-navy-900 tracking-tight">{editingLeadId ? 'Updated!' : 'Success!'}</h2>
                <p className="text-slate-500 mt-3 font-bold text-sm uppercase tracking-widest">{editingLeadId ? 'Lead updated successfully.' : 'Lead captured and synced to cloud.'}</p>
              </div>

              <div className="bg-white rounded-[2.5rem] p-10 shadow-[0_20px_60px_rgba(15,23,42,0.05)] border border-slate-100 max-w-md mx-auto relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-slate-50 rounded-full -mr-16 -mt-16 opacity-50" />
                
                <div className="space-y-6 text-left relative z-10">
                  <div className="space-y-1">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Visitor</span>
                    <p className="text-xl font-black text-navy-900">{lastSavedLead?.name}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Mobile</span>
                      <p className="font-bold text-navy-700">{lastSavedLead?.mobile}</p>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">City</span>
                      <p className="font-bold text-navy-700">{lastSavedLead?.city}</p>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Inquiry</span>
                    <p className="font-bold text-navy-800 leading-tight">{lastSavedLead?.inquiry}</p>
                  </div>
                  {lastSavedLead?.cardImage && (
                    <div className="pt-2">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Visiting Card</span>
                      <img src={lastSavedLead.cardImage} className="w-full h-32 object-cover rounded-2xl border border-slate-100" alt="Card" />
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-4 max-w-md mx-auto">
                <button
                  onClick={shareOnWhatsApp}
                  className="w-full bg-[#25D366] hover:bg-[#128C7E] text-white font-black py-6 rounded-3xl transition-all flex items-center justify-center gap-4 shadow-2xl shadow-emerald-200 group"
                >
                  <MessageCircle className="w-8 h-8 group-hover:scale-110 transition-transform" />
                  Send WhatsApp Welcome
                </button>
                
                <button
                  onClick={() => {
                    resetForm();
                    setView('form');
                  }}
                  className="w-full bg-white hover:bg-stone-50 text-stone-600 font-black py-5 rounded-3xl transition-all border-2 border-stone-100"
                >
                  Next Visitor
                </button>
              </div>
            </motion.div>
          )}

          {view === 'list' && (
            <motion.div
              key="list"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-black tracking-tight flex items-center gap-3 text-navy-900">
                  <div className="w-2 h-8 bg-brass-500 rounded-full" />
                  All Entries
                </h2>
                <div className="flex items-center gap-3">
                  <button
                    onClick={exportToCSV}
                    className="bg-white text-navy-600 border border-navy-200 px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 hover:bg-navy-50 transition-all shadow-lg shadow-navy-50"
                  >
                    <Download className="w-4 h-4" />
                    Export CSV
                  </button>
                  <div className="bg-navy-600 px-4 py-2 rounded-2xl shadow-lg shadow-navy-100 text-xs font-black text-white">
                    {recentLeads.length} Total Records
                  </div>
                </div>
              </div>

              {recentLeads.length === 0 ? (
                <div className="text-center py-32 bg-white rounded-[2.5rem] border-2 border-dashed border-navy-100">
                  <div className="w-20 h-20 bg-navy-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Users className="w-10 h-10 text-navy-200" />
                  </div>
                  <p className="text-navy-400 font-bold">No visitors recorded yet.</p>
                </div>
              ) : (
                <div className="bg-white rounded-[2rem] shadow-[0_20px_60px_rgba(15,23,42,0.05)] border border-slate-100 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-navy-50/50 border-b border-navy-100">
                          <th className="px-6 py-4 text-[10px] font-black text-navy-400 uppercase tracking-widest">Date & Time</th>
                          <th className="px-6 py-4 text-[10px] font-black text-navy-400 uppercase tracking-widest">Staff</th>
                          <th className="px-6 py-4 text-[10px] font-black text-navy-400 uppercase tracking-widest">Visitor</th>
                          <th className="px-6 py-4 text-[10px] font-black text-navy-400 uppercase tracking-widest">Mobile</th>
                          <th className="px-6 py-4 text-[10px] font-black text-navy-400 uppercase tracking-widest">City</th>
                          <th className="px-6 py-4 text-[10px] font-black text-navy-400 uppercase tracking-widest">Inquiry</th>
                          <th className="px-6 py-4 text-[10px] font-black text-navy-400 uppercase tracking-widest">Card</th>
                          <th className="px-6 py-4 text-[10px] font-black text-navy-400 uppercase tracking-widest text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {recentLeads.map((lead) => (
                          <tr 
                            key={lead.id} 
                            onClick={() => handleEditLead(lead)}
                            className="hover:bg-slate-50/50 transition-colors group cursor-pointer"
                          >
                            <td className="px-6 py-4">
                              <div className="text-xs font-bold text-slate-900">
                                {lead.createdAt ? new Date(lead.createdAt).toLocaleDateString() : 'Just now'}
                              </div>
                              <div className="text-[10px] font-medium text-slate-400">
                                {lead.createdAt ? new Date(lead.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className="text-[10px] font-black text-navy-600 bg-navy-50 px-2.5 py-1 rounded-lg border border-navy-100">
                                {lead.staffName}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="text-sm font-black text-navy-900">{lead.name}</div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                                <Phone className="w-3 h-3 text-slate-300" />
                                {lead.mobile}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                                <MapPin className="w-3 h-3 text-slate-300" />
                                {lead.city}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="text-[10px] font-black text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg inline-block border border-emerald-100 uppercase tracking-tight">
                                {lead.inquiry}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              {lead.cardImage ? (
                                <div 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPreviewLead(lead);
                                  }}
                                  className="w-10 h-10 rounded-lg overflow-hidden border border-slate-100 shadow-sm cursor-zoom-in hover:scale-110 transition-transform"
                                >
                                  <img src={lead.cardImage} className="w-full h-full object-cover" alt="Card" />
                                </div>
                              ) : (
                                <div 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleEditLead(lead);
                                    setTimeout(() => startCamera(), 100);
                                  }}
                                  className="w-10 h-10 rounded-lg bg-slate-50 flex items-center justify-center border border-slate-100 cursor-pointer hover:bg-slate-100 transition-colors"
                                >
                                  <ImageIcon className="w-4 h-4 text-slate-200" />
                                </div>
                              )}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <button
                                onClick={(e) => handleDeleteLead(lead, e)}
                                className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                                title="Delete Record"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Camera Modal Overlay */}
      <AnimatePresence>
        {previewLead && (
          <ImagePreviewModal 
            lead={previewLead} 
            onClose={() => setPreviewLead(null)} 
          />
        )}
        {showCamera && (
          <motion.div 
            initial={{ opacity: 0, x: '100%' }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-0 z-50 bg-brass-900/95 backdrop-blur-xl flex flex-col p-6"
          >
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-white font-black text-xl tracking-tight">Capture Visiting Card</h3>
              <button onClick={stopCamera} className="bg-white/10 text-white p-3 rounded-full hover:bg-white/20 transition-all border border-white/10">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="flex-1 relative rounded-[2.5rem] overflow-hidden bg-navy-950 shadow-2xl border border-white/10">
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 border-[2px] border-white/20 rounded-[2.5rem] pointer-events-none m-8" />
              
              <div className="absolute bottom-10 left-0 right-0 flex justify-center">
                <button 
                  onClick={capturePhoto}
                  className="w-20 h-20 bg-white rounded-full p-1 shadow-2xl active:scale-95 transition-transform"
                >
                  <div className="w-full h-full border-4 border-navy-900 rounded-full flex items-center justify-center">
                    <div className="w-12 h-12 bg-navy-800 rounded-full" />
                  </div>
                </button>
              </div>
            </div>
            
            <p className="text-white/40 text-[10px] font-bold text-center mt-6 uppercase tracking-[0.3em]">Align card within the frame</p>
            <canvas ref={canvasRef} className="hidden" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {leadToDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/80 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[2rem] p-8 max-w-sm w-full shadow-2xl border border-slate-100"
            >
              <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
                <Trash2 className="w-8 h-8 text-red-500" />
              </div>
              <h3 className="text-2xl font-black text-center text-navy-900 mb-2">Delete Record?</h3>
              <p className="text-center text-slate-500 font-medium mb-8">
                Are you sure you want to delete the record for <span className="font-bold text-navy-900">{leadToDelete.name}</span>? This action cannot be undone.
              </p>
              <div className="flex gap-4">
                <button
                  onClick={() => setLeadToDelete(null)}
                  className="flex-1 py-4 rounded-2xl font-black text-slate-500 bg-slate-50 hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={executeDelete}
                  className="flex-1 py-4 rounded-2xl font-black text-white bg-red-500 hover:bg-red-600 transition-colors shadow-lg shadow-red-200"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Status Bar */}
      <footer className="fixed bottom-8 left-1/2 -translate-x-1/2 w-[calc(100%-3rem)] max-w-md z-20">
        <motion.div 
          initial={{ y: 100 }}
          animate={{ y: 0 }}
          className="bg-white border border-navy-50 shadow-[0_20px_50px_rgba(59,130,246,0.15)] rounded-3xl p-4 flex justify-between items-center"
        >
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-2.5 h-2.5 rounded-full animate-pulse",
              isOnline ? "bg-emerald-400" : "bg-rose-400"
            )} />
            <div className="flex flex-col">
              <span className="text-[10px] font-black uppercase tracking-widest text-navy-900">
                {isOnline ? "Live Session" : "Offline Mode"}
              </span>
              <span className="text-[8px] font-black text-navy-400 uppercase tracking-tight">
                {formData.staffName}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {pendingLeads.length > 0 && (
              <button 
                onClick={() => isOnline && syncOfflineLeads()}
                disabled={isSyncing}
                className={cn(
                  "bg-rose-50 text-rose-500 px-2 py-1 rounded-lg text-[8px] font-black uppercase flex items-center gap-1 border border-rose-100",
                  isOnline ? "animate-bounce cursor-pointer" : "opacity-50 cursor-not-allowed",
                  isSyncing && "animate-pulse"
                )}
              >
                {(isOnline || isSyncing) && <RefreshCw className={cn("w-2 h-2", isSyncing ? "animate-spin" : "animate-spin-slow")} />}
                {isSyncing ? "Syncing..." : `${pendingLeads.length} Sync`}
              </button>
            )}
            <span className="text-[10px] font-black text-navy-600 bg-navy-50 px-3 py-1 rounded-full uppercase tracking-widest border border-navy-100">
              {recentLeads.length + pendingLeads.length} Leads
            </span>
          </div>
        </motion.div>
      </footer>
    </div>
  );
}
