import React, { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, Upload, X, Check, Loader2 } from 'lucide-react';
import { useWeather } from '../context/WeatherContext';

/**
 * Compresses an image file using an offscreen canvas.
 * Returns a Blob (JPEG) and a base64 data URL.
 */
const compressImage = (file, maxWidth = 1200, quality = 0.7) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                // Scale down if wider than maxWidth
                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                // Convert to blob
                canvas.toBlob(
                    (blob) => {
                        const dataUrl = canvas.toDataURL('image/jpeg', quality);
                        resolve({
                            blob,
                            dataUrl,
                            width,
                            height,
                            originalSize: file.size,
                            compressedSize: blob.size,
                        });
                    },
                    'image/jpeg',
                    quality
                );
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
};

/**
 * Generates weather metadata for the photo tag.
 */
const generateWeatherTag = (weather, theme, venueName) => {
    if (!weather) {
        return {
            temperature: null,
            conditions: 'Unknown',
            sunshineStatus: 'Unknown',
            description: 'Weather data unavailable',
        };
    }

    const temp = Math.round(weather.main.temp);
    const conditions = weather.weather?.[0]?.main || 'Unknown';
    const description = weather.weather?.[0]?.description || '';

    // Determine sunshine/cloud status
    let sunshineStatus;
    const condLower = conditions.toLowerCase();
    if (condLower.includes('clear') || condLower === 'sunny') {
        sunshineStatus = 'Sunny';
    } else if (condLower.includes('cloud')) {
        sunshineStatus = 'Cloudy';
    } else if (condLower.includes('rain') || condLower.includes('drizzle')) {
        sunshineStatus = 'Rainy';
    } else {
        sunshineStatus = conditions;
    }

    return {
        temperature: temp,
        conditions,
        sunshineStatus,
        description,
        humidity: weather.main?.humidity,
        windSpeed: weather.wind?.speed,
    };
};

/**
 * Saves a photo to localStorage (demo storage).
 * In production, replace with Firebase Storage upload.
 */
const savePhotoToStorage = (photoData) => {
    const STORAGE_KEY = 'sunstay_venue_photos';
    const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    existing.unshift(photoData);

    // Cap at 50 photos total to avoid localStorage limits
    const trimmed = existing.slice(0, 50);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    return photoData;
};

const DEMO_PHOTOS = [
    {
        id: 'demo-1',
        url: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=800&q=70',
        timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        weather: { temp: 24, sunshineStatus: 'Sunny', condition: 'Clear' },
        featured: true,
        author: 'Sarah M.',
        likes: 12
    },
    {
        id: 'demo-2',
        url: 'https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=800&q=70',
        timestamp: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
        weather: { temp: 22, sunshineStatus: 'Partly Cloudy', condition: 'Clouds' },
        featured: false,
        author: 'James T.',
        likes: 8
    },
    {
        id: 'demo-3',
        url: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=800&q=70',
        timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        weather: { temp: 23, sunshineStatus: 'Sunny', condition: 'Clear' },
        featured: true,
        author: 'Elena R.',
        likes: 24
    }
];

export const getDemoPhotos = (venueId) => {
    return DEMO_PHOTOS.map(p => ({ ...p, venueId, isDemo: true }));
};

/**
 * Retrieve photos for a specific venue from localStorage.
 * Now includes demo photos if no user photos are found.
 */
export const getPhotosForVenue = (venueId) => {
    const STORAGE_KEY = 'sunstay_venue_photos';
    const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    const userPhotos = all.filter((p) => p.venueId === venueId);

    // If no user photos, return demo photos to populate the UI
    if (userPhotos.length === 0) {
        return getDemoPhotos(venueId);
    }

    return userPhotos;
};

/**
 * Get ALL photos from localStorage (cross-venue).
 */
export const getAllPhotos = () => {
    const STORAGE_KEY = 'sunstay_venue_photos';
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
};

/**
 * Toggle featured status for a photo.
 * Featured photos appear highlighted in the gallery and dashboard.
 */
export const toggleFeaturedPhoto = (photoId) => {
    const STORAGE_KEY = 'sunstay_venue_photos';
    const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    const updated = all.map((p) => {
        if (p.id === photoId) {
            return { ...p, featured: !p.featured };
        }
        return p;
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    // Return the updated photo
    return updated.find((p) => p.id === photoId);
};

const PhotoUpload = ({ venue, onPhotoUploaded, categoryConfig }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [selectedFile, setSelectedFile] = useState(null);
    const [preview, setPreview] = useState(null);
    const [uploadState, setUploadState] = useState('idle'); // idle | compressing | uploading | success | error
    const [compressionInfo, setCompressionInfo] = useState(null);
    const fileInputRef = useRef(null);
    const { weather, theme } = useWeather();

    const handleFileSelect = useCallback((e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate file type
        if (!file.type.startsWith('image/')) {
            alert('Please select an image file.');
            return;
        }

        // Validate file size (max 20MB raw)
        if (file.size > 20 * 1024 * 1024) {
            alert('Image too large. Please select a file under 20MB.');
            return;
        }

        setSelectedFile(file);

        // Show preview
        const reader = new FileReader();
        reader.onload = (ev) => setPreview(ev.target.result);
        reader.readAsDataURL(file);
    }, []);

    const handleUpload = useCallback(async () => {
        if (!selectedFile || !venue) return;

        try {
            // Step 1: Compress
            setUploadState('compressing');
            const compressed = await compressImage(selectedFile);
            setCompressionInfo({
                original: (selectedFile.size / 1024).toFixed(0),
                compressed: (compressed.compressedSize / 1024).toFixed(0),
                savings: Math.round((1 - compressed.compressedSize / selectedFile.size) * 100),
            });

            // Step 2: Generate weather tag
            const weatherTag = generateWeatherTag(weather, theme, venue.venueName);

            // Step 3: Upload to storage
            setUploadState('uploading');

            // Simulate network delay for realism
            await new Promise((resolve) => setTimeout(resolve, 800));

            const photoData = {
                id: `photo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                venueId: venue.id,
                venueName: venue.venueName,
                dataUrl: compressed.dataUrl,
                timestamp: new Date().toISOString(),
                weather: weatherTag,
                metadata: {
                    originalName: selectedFile.name,
                    width: compressed.width,
                    height: compressed.height,
                    originalSizeKB: (selectedFile.size / 1024).toFixed(0),
                    compressedSizeKB: (compressed.compressedSize / 1024).toFixed(0),
                    format: 'image/jpeg',
                },
            };

            savePhotoToStorage(photoData);

            setUploadState('success');

            // Notify parent
            if (onPhotoUploaded) {
                onPhotoUploaded(photoData);
            }

            // Auto-close after success
            setTimeout(() => {
                resetState();
            }, 2000);
        } catch (err) {
            console.error('Upload failed:', err);
            setUploadState('error');
        }
    }, [selectedFile, venue, weather, theme, onPhotoUploaded]);

    const resetState = () => {
        setSelectedFile(null);
        setPreview(null);
        setUploadState('idle');
        setCompressionInfo(null);
        setIsOpen(false);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handleCancel = () => {
        if (uploadState === 'compressing' || uploadState === 'uploading') return;
        resetState();
    };

    // Weather tag info for display
    const weatherTag = generateWeatherTag(weather, theme, venue?.venueName);

    // Category-aware copy (fallback to bar defaults)
    const cc = categoryConfig || {};
    const buttonText = cc.buttonText || 'Share Photo';
    const buttonSubtext = cc.buttonSubtext || '📸 Weather-Tagged';
    const modalTitle = cc.modalTitle || 'Share a Photo';
    const modalSubtitle = cc.modalSubtitle || venue?.venueName;
    const capturePrompt = cc.capturePrompt || 'Tap to capture';
    const captureSubtext = cc.captureSubtext || 'Camera or gallery';
    const uploadButtonText = cc.uploadButtonText || 'Upload Weather-Tagged Photo';

    return (
        <>
            {/* Share Photo Button */}
            <motion.button
                id="share-photo-btn"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setIsOpen(true)}
                className="w-full py-3 bg-white/70 backdrop-blur-sm border border-gray-200 text-gray-700 font-bold text-sm rounded-2xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 group"
            >
                <Camera size={18} className="text-orange-500 group-hover:text-orange-600 transition-colors" />
                <span>{buttonText}</span>
                <span className="text-xs text-gray-400 font-normal">{buttonSubtext}</span>
            </motion.button>

            {/* Upload Modal */}
            <AnimatePresence>
                {isOpen && (
                    <>
                        {/* Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={handleCancel}
                            className="fixed inset-0 bg-black/40 z-[60]"
                        />

                        {/* Modal */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                            className="fixed inset-x-4 top-[10%] z-[61] mx-auto max-w-md"
                        >
                            <div className="photo-upload-modal bg-white rounded-3xl shadow-2xl overflow-hidden border border-gray-100">
                                {/* Header */}
                                <div className="photo-upload-header px-5 py-4 flex items-center justify-between">
                                    <div>
                                        <h3 className="text-lg font-bold text-white">{modalTitle}</h3>
                                        <p className="text-xs text-white/70">{modalSubtitle || venue?.venueName}</p>
                                    </div>
                                    <button
                                        onClick={handleCancel}
                                        className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors"
                                    >
                                        <X size={16} className="text-white" />
                                    </button>
                                </div>

                                {/* Content */}
                                <div className="p-5">
                                    {/* Weather Tag Preview */}
                                    <div className="weather-tag-preview mb-4 p-3 rounded-2xl flex items-center gap-3">
                                        <div className="weather-tag-icon w-10 h-10 rounded-xl flex items-center justify-center text-lg">
                                            {weatherTag.sunshineStatus === 'Sunny'
                                                ? '☀️'
                                                : weatherTag.sunshineStatus === 'Cloudy'
                                                    ? '☁️'
                                                    : weatherTag.sunshineStatus === 'Rainy'
                                                        ? '🌧️'
                                                        : '🌤️'}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold text-gray-800">
                                                Auto-tagged:{' '}
                                                <span className="text-orange-600">
                                                    {weatherTag.sunshineStatus}
                                                    {weatherTag.temperature !== null && `, ${weatherTag.temperature}°C`}
                                                </span>
                                            </p>
                                            <p className="text-xs text-gray-500 truncate">
                                                📍 {venue?.venueName} · {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </p>
                                        </div>
                                    </div>

                                    {/* File Input / Preview */}
                                    {!preview ? (
                                        <div
                                            onClick={() => fileInputRef.current?.click()}
                                            className="photo-capture-zone rounded-2xl p-8 text-center cursor-pointer transition-all hover:border-orange-400"
                                        >
                                            <div className="photo-capture-icon w-16 h-16 rounded-full mx-auto mb-3 flex items-center justify-center">
                                                <Camera size={28} className="text-orange-500" />
                                            </div>
                                            <p className="font-bold text-gray-700 mb-1">{capturePrompt}</p>
                                            <p className="text-xs text-gray-400">{captureSubtext}</p>
                                        </div>
                                    ) : (
                                        <div className="relative mb-4">
                                            <img
                                                src={preview}
                                                alt="Preview"
                                                className="w-full rounded-2xl object-cover max-h-64 shadow-lg"
                                            />
                                            {/* Weather overlay badge on preview */}
                                            <div className="absolute bottom-3 left-3 photo-weather-badge px-3 py-1.5 rounded-full flex items-center gap-1.5 text-xs font-bold text-white">
                                                <span>
                                                    {weatherTag.sunshineStatus === 'Sunny'
                                                        ? '☀️'
                                                        : weatherTag.sunshineStatus === 'Cloudy'
                                                            ? '☁️'
                                                            : '🌧️'}
                                                </span>
                                                <span>
                                                    {weatherTag.sunshineStatus}
                                                    {weatherTag.temperature !== null && `, ${weatherTag.temperature}°C`}
                                                </span>
                                            </div>
                                            {uploadState === 'idle' && (
                                                <button
                                                    onClick={() => {
                                                        setSelectedFile(null);
                                                        setPreview(null);
                                                        if (fileInputRef.current) fileInputRef.current.value = '';
                                                    }}
                                                    className="absolute top-3 right-3 w-8 h-8 bg-black/50 rounded-full flex items-center justify-center hover:bg-black/70 transition-colors"
                                                >
                                                    <X size={14} className="text-white" />
                                                </button>
                                            )}
                                        </div>
                                    )}

                                    {/* Hidden file input */}
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/*"
                                        capture="camera"
                                        onChange={handleFileSelect}
                                        className="hidden"
                                        id="photo-file-input"
                                    />

                                    {/* Compression info */}
                                    {compressionInfo && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            className="mb-3 p-2 bg-green-50 rounded-xl border border-green-100"
                                        >
                                            <p className="text-xs text-green-700 font-medium text-center">
                                                📦 Compressed: {compressionInfo.original}KB → {compressionInfo.compressed}KB
                                                <span className="text-green-600 font-bold"> ({compressionInfo.savings}% smaller)</span>
                                            </p>
                                        </motion.div>
                                    )}

                                    {/* Upload States */}
                                    {uploadState === 'compressing' && (
                                        <div className="flex items-center justify-center gap-3 py-4">
                                            <Loader2 size={20} className="animate-spin text-orange-500" />
                                            <span className="text-sm font-medium text-gray-600">Compressing image...</span>
                                        </div>
                                    )}

                                    {uploadState === 'uploading' && (
                                        <div className="py-4">
                                            <div className="flex items-center justify-center gap-3 mb-2">
                                                <Loader2 size={20} className="animate-spin text-orange-500" />
                                                <span className="text-sm font-medium text-gray-600">Uploading...</span>
                                            </div>
                                            <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                                                <motion.div
                                                    initial={{ width: '10%' }}
                                                    animate={{ width: '90%' }}
                                                    transition={{ duration: 0.8 }}
                                                    className="h-full bg-gradient-to-r from-orange-400 to-amber-500 rounded-full"
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {uploadState === 'success' && (
                                        <motion.div
                                            initial={{ scale: 0.8, opacity: 0 }}
                                            animate={{ scale: 1, opacity: 1 }}
                                            className="py-4 text-center"
                                        >
                                            <div className="w-14 h-14 rounded-full bg-green-100 mx-auto mb-2 flex items-center justify-center">
                                                <Check size={28} className="text-green-600" />
                                            </div>
                                            <p className="font-bold text-green-700">Photo shared!</p>
                                            <p className="text-xs text-gray-500">Weather-tagged & saved</p>
                                        </motion.div>
                                    )}

                                    {uploadState === 'error' && (
                                        <motion.div
                                            initial={{ scale: 0.8, opacity: 0 }}
                                            animate={{ scale: 1, opacity: 1 }}
                                            className="py-4 text-center"
                                        >
                                            <p className="font-bold text-red-600 mb-1">Upload failed</p>
                                            <p className="text-xs text-gray-500 mb-3">Please try again</p>
                                            <button
                                                onClick={() => setUploadState('idle')}
                                                className="px-4 py-2 text-sm font-bold text-orange-600 bg-orange-50 rounded-xl hover:bg-orange-100 transition-colors"
                                            >
                                                Retry
                                            </button>
                                        </motion.div>
                                    )}

                                    {/* Upload Button */}
                                    {preview && uploadState === 'idle' && (
                                        <motion.button
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            whileHover={{ scale: 1.02 }}
                                            whileTap={{ scale: 0.98 }}
                                            onClick={handleUpload}
                                            className="photo-upload-btn w-full py-3.5 text-white font-bold text-sm rounded-2xl shadow-lg flex items-center justify-center gap-2"
                                        >
                                            <Upload size={18} />
                                            <span>{uploadButtonText}</span>
                                        </motion.button>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </>
    );
};

export default PhotoUpload;
