document.addEventListener('DOMContentLoaded', () => {
    // --- Elements ---
    const goesImage = document.getElementById('goes-image');
    const loadingMessage = document.getElementById('loading-message');
    const playPauseBtn = document.getElementById('play-pause-btn');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const scrubber = document.getElementById('scrubber');
    const scriptTag = document.getElementById('main-script');
    const imageContainer = document.querySelector('.image-container');

    // --- Configuration ---
    const ANIMATION_FPS = 5;
    const FRAME_INTERVAL_MS = 1000 / ANIMATION_FPS;
    const LAST_FRAME_HOLD_TIME_MS = 1000;
    const JSON_PATH = scriptTag.dataset.regionJson;
    // --- Full-image zoom config ---
    const ZOOM_SCALE = 2.0; // tweak to taste (e.g., 1.9–2.2)

    // --- State Variables ---
    let imagePaths = []; 
    let imageCache = {}; 
    let currentIndex = 0;
    let isPlaying = true;
    let zoomActive = false;
    let zoomPointerId = null;

    // --- State for requestAnimationFrame ---
    let animationFrameId;
    let lastFrameTime = 0;

    // --- Animation Control Functions ---
    
    function startAnimation() {
        if (isPlaying) return;
        isPlaying = true;
        playPauseBtn.textContent = '■ Pause';
        lastFrameTime = performance.now();
        animationFrameId = requestAnimationFrame(runAnimationLoop);
    }

    function stopAnimation() {
        if (!isPlaying) return;
        isPlaying = false;
        playPauseBtn.textContent = '▶ Play';
        cancelAnimationFrame(animationFrameId);
    }

    function togglePlayPause() {
        if (isPlaying) {
            stopAnimation();
        } else {
            if (imagePaths.length > 0) {
                startAnimation();
            }
        }
    }

    function prevFrame() {
        stopAnimation(); 
        const newIndex = (currentIndex - 1 + imagePaths.length) % imagePaths.length;
        updateUI(newIndex);
    }

    function nextFrame() {
        stopAnimation();
        const newIndex = (currentIndex + 1) % imagePaths.length;
        updateUI(newIndex);
    }

    // --- UI Update and Display Functions ---

    /**
     * Central function to update all UI elements based on the frame index.
     * @param {number} index - The index of the frame to display.
     */
    function updateUI(index) {
        currentIndex = index;
        scrubber.value = index; // Sync scrubber position
        displayFrame(index);
    }

    function displayFrame(index) {
        const path = imagePaths[index];
        const cachedImage = imageCache[path];
        if (cachedImage) {
            goesImage.src = cachedImage.src; 
        }
    }

    /**
     * REFACTORED: Manages the animation loop using requestAnimationFrame.
     * @param {DOMHighResTimeStamp} currentTime - Provided by requestAnimationFrame
     */
    function runAnimationLoop(currentTime) {
        if (!isPlaying) return;

        const timeSinceLastFrame = currentTime - lastFrameTime;
        const isLastFrame = (currentIndex === imagePaths.length - 1);
        const currentFrameInterval = isLastFrame ? LAST_FRAME_HOLD_TIME_MS : FRAME_INTERVAL_MS;

        if (timeSinceLastFrame >= currentFrameInterval) {
            lastFrameTime = currentTime;
            const nextIndex = (currentIndex + 1) % imagePaths.length;
            updateUI(nextIndex); // Use updateUI to sync scrubber
        }
        
        animationFrameId = requestAnimationFrame(runAnimationLoop);
    }

    // --- Magnification Functions ---
    
    function applyZoomAt(e) {
        const rect = goesImage.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        // Set pivot to the touched point so that point stays under the finger
        goesImage.style.transformOrigin = `${x}px ${y}px`;
        goesImage.style.transform = `scale(${ZOOM_SCALE})`;
    }

    function startZoom(e) {
        if (zoomActive) return;
        zoomActive = true;
        zoomPointerId = e.pointerId;
        goesImage.setPointerCapture?.(zoomPointerId);
        applyZoomAt(e);
    }

    function moveZoom(e) {
        if (!zoomActive || e.pointerId !== zoomPointerId) return;
        applyZoomAt(e);
    }

    function endZoom(e) {
        if (!zoomActive || (e && e.pointerId !== zoomPointerId)) return;
        goesImage.releasePointerCapture?.(zoomPointerId);
        zoomActive = false;
        zoomPointerId = null;
        goesImage.style.transform = 'scale(1)';
        goesImage.style.transformOrigin = ''; // reset to default
    }
    
    // --- Loading and Initialization ---

    async function loadAllImages() {
        if (imagePaths.length === 0) return;
        
        let loadedCount = 0;
        const totalCount = imagePaths.length;
        
        const loadPromises = imagePaths.map(path => {
            return new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => {
                    loadedCount++;
                    loadingMessage.textContent = `Loading Image ${loadedCount}/${totalCount}...`;
                    imageCache[path] = img; 
                    resolve();
                };
                img.onerror = () => {
                    console.error(`Failed to load image: ${path}`);
                    reject(new Error(`Failed to load ${path}`));
                };
                img.src = path;
            });
        });
        
        try {
            await Promise.all(loadPromises);
            
            loadingMessage.style.display = 'none';
            goesImage.style.display = 'block';
            document.querySelector('.controls-container').style.display = 'flex';
            
            // Setup and show the scrubber
            scrubber.max = imagePaths.length - 1;
            scrubber.parentElement.style.display = 'block';

            // Display the first frame and sync UI
            updateUI(0);
            
            // Start animation
            isPlaying = false;
            togglePlayPause();

        } catch (error) {
            console.error("Failed to load one or more images:", error);
            loadingMessage.textContent = "Error loading images. Please try refreshing.";
        }
    }

    async function fetchImages() {
        try {
            const response = await fetch(JSON_PATH);
            imagePaths = await response.json();
            
            if (imagePaths.length > 0) {
                loadAllImages();
            }
        } catch (error) {
            console.error('Failed to fetch image list:', error);
            loadingMessage.textContent = "Error loading data. Please try refreshing.";
        }
    }

    // Handle user interaction with the scrubber
    function handleScrubberInput() {
        stopAnimation();
        const newIndex = parseInt(scrubber.value, 10);
        updateUI(newIndex);
    }
    
    // --- Initialization & Event Listeners ---
    
    playPauseBtn.addEventListener('click', togglePlayPause);
    prevBtn.addEventListener('click', prevFrame);
    nextBtn.addEventListener('click', nextFrame);
    scrubber.addEventListener('change', handleScrubberInput);

    // Full-image zoom: press-and-follow
    goesImage.addEventListener('pointerdown', (e) => {
        // Default: enable for touch and pen; uncomment to enable mouse for desktop testing
        if (e.pointerType === 'touch' || e.pointerType === 'pen') startZoom(e);
        // else startZoom(e);
    });
    goesImage.addEventListener('pointermove', moveZoom);
    goesImage.addEventListener('pointerup', endZoom);
    goesImage.addEventListener('pointercancel', endZoom);
    // We do not end on pointerleave because we use pointer capture

    fetchImages();
});
