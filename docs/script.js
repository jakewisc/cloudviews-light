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
    const magnifier = document.getElementById('magnifier');

    // --- Configuration ---
    const ANIMATION_FPS = 5;
    const FRAME_INTERVAL_MS = 1000 / ANIMATION_FPS;
    const LAST_FRAME_HOLD_TIME_MS = 1000;
    const JSON_PATH = scriptTag.dataset.regionJson;
    // --- Magnifier Config ---
    const MAG_ZOOM = 2.5;         // how much to zoom the region inside the lens
    const MAG_DIAMETER = 180;     // must match CSS width/height
    const MAG_RADIUS = MAG_DIAMETER / 2;
    // Offset the lens so your finger doesn't hide the focal point
    const MAG_OFFSET = { x: 16, y: -(MAG_RADIUS + 16) }; // right and above finger

    // --- State Variables ---
    let imagePaths = []; 
    let imageCache = {}; 
    let currentIndex = 0;
    let isPlaying = true;
    let activePointerId = null;
    let magnifierActive = false;

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
          if (magnifierActive) {
            // Keep the lens showing the same frame as the main image
            updateMagnifierSource();
          }
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

    function clamp(value, min, max) {
      return Math.max(min, Math.min(max, value));
    }
    
    // Keep the lens image in sync with the current animation frame
    function updateMagnifierSource() {
      const path = imagePaths[currentIndex];
      if (!path) return;
      magnifier.style.backgroundImage = `url(${path})`;
    
      // Use the preloaded image to compute background size
      const img = imageCache[path];
      const nW = img?.naturalWidth || goesImage.naturalWidth || 0;
      const nH = img?.naturalHeight || goesImage.naturalHeight || 0;
    
      if (nW && nH) {
        magnifier.style.backgroundSize = `${nW * MAG_ZOOM}px ${nH * MAG_ZOOM}px`;
      }
    }
    
    // Position the lens and set background position so the touched point is centered
    function moveMagnifier(clientX, clientY) {
      const imgRect = goesImage.getBoundingClientRect();
      const containerRect = imageContainer.getBoundingClientRect();
    
      // Relative to displayed image
      let xRelImg = clientX - imgRect.left;
      let yRelImg = clientY - imgRect.top;
    
      // Clamp within the image rectangle
      xRelImg = clamp(xRelImg, 0, imgRect.width);
      yRelImg = clamp(yRelImg, 0, imgRect.height);
    
      // Natural-image coordinates
      const path = imagePaths[currentIndex];
      const img = imageCache[path];
      const nW = img?.naturalWidth || goesImage.naturalWidth || 0;
      const nH = img?.naturalHeight || goesImage.naturalHeight || 0;
      if (!nW || !nH) return;
    
      const scaleX = nW / imgRect.width;
      const scaleY = nH / imgRect.height;
    
      const nx = xRelImg * scaleX;
      const ny = yRelImg * scaleY;
    
      // Set background so the touched point is at the center of the lens
      const bgX = -(nx * MAG_ZOOM - MAG_RADIUS);
      const bgY = -(ny * MAG_ZOOM - MAG_RADIUS);
      magnifier.style.backgroundPosition = `${bgX}px ${bgY}px`;
    
      // Position lens relative to container, offset to avoid finger overlap
      let centerX = (clientX - containerRect.left) + MAG_OFFSET.x;
      let centerY = (clientY - containerRect.top) + MAG_OFFSET.y;
    
      // Keep lens fully inside the container
      let left = clamp(centerX - MAG_RADIUS, 0, containerRect.width - MAG_DIAMETER);
      let top  = clamp(centerY - MAG_RADIUS, 0, containerRect.height - MAG_DIAMETER);
    
      magnifier.style.left = `${left}px`;
      magnifier.style.top = `${top}px`;
    }
    
    function showMagnifier(e) {
      if (magnifierActive) return;
      activePointerId = e.pointerId;
      magnifierActive = true;
      goesImage.setPointerCapture?.(activePointerId);
      updateMagnifierSource();
      magnifier.style.display = 'block';
      moveMagnifier(e.clientX, e.clientY);
    }
    
    function updateMagnifier(e) {
      if (!magnifierActive || e.pointerId !== activePointerId) return;
      moveMagnifier(e.clientX, e.clientY);
    }
    
    function hideMagnifier(e) {
      if (!magnifierActive || (e && e.pointerId !== activePointerId)) return;
      goesImage.releasePointerCapture?.(activePointerId);
      activePointerId = null;
      magnifierActive = false;
      magnifier.style.display = 'none';
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

    // Magnifier pointer events (works on iOS/Android + desktop)
    goesImage.addEventListener('pointerdown', (e) => {
      // Only show by default for touch/pen; allow mouse too if you want
      if (e.pointerType === 'touch' || e.pointerType === 'pen') {
        showMagnifier(e);
      }
      // If you also want to support mouse: uncomment next line
      // else showMagnifier(e);
    });
    
    goesImage.addEventListener('pointermove', updateMagnifier);
    goesImage.addEventListener('pointerup', hideMagnifier);
    goesImage.addEventListener('pointercancel', hideMagnifier);
    // Optional: if you want to hide lens when the pointer leaves the image
    goesImage.addEventListener('pointerleave', hideMagnifier);

    fetchImages();
});
