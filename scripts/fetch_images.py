import requests
from bs4 import BeautifulSoup
import os
import json
import concurrent.futures
import logging
from PIL import Image
import io
from functools import partial

# Set up basic logging for better feedback
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# --- Constants ---
IMAGE_SIZE_FILTER = "2400x2400.jpg"
MAX_IMAGES_TO_KEEP = 48  # 4 hour sequence
WEBP_QUALITY = 90  # WebP compression quality (0-100)
MAX_WORKERS = 10   # Number of concurrent download threads

# --- Cropping Configuration ---
# A tuple defining the crop area: (left, upper, right, lower).
# These coordinates are set to isolate Wisconsin from the 2400x2400 UMV image.
CROP_BOX = (1550, 286, 2400, 1136)

# --- Base Paths (relative to the script's location) ---
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(SCRIPT_DIR)

# --- Configuration for the UMV (Upper Midwest Valley) region ---
# This script is optimized to only process this single region.
REGION_NAME = "umv"
BASE_URL = "https://cdn.star.nesdis.noaa.gov/GOES19/ABI/SECTOR/umv/GEOCOLOR/"
SAVE_DIR = os.path.join(ROOT_DIR, "docs", "images", REGION_NAME)
JSON_FILE = os.path.join(ROOT_DIR, "docs", "images", f"images_{REGION_NAME}.json")


def download_image(file_name, base_url, save_dir):
    """
    Downloads a single image file, crops it, converts it to WebP, and saves it.
    Returns the local path of the saved WebP file if successful, otherwise None.
    """
    webp_filename = file_name.replace(".jpg", ".webp")
    local_webp_path = os.path.join(save_dir, webp_filename)

    if os.path.exists(local_webp_path):
        # This is logged at the DEBUG level to avoid cluttering the output
        logging.debug(f"Skipping {webp_filename}, already exists.")
        return local_webp_path

    try:
        url = base_url + file_name
        r = requests.get(url, timeout=30)
        r.raise_for_status()

        image_data = io.BytesIO(r.content)
        img = Image.open(image_data)

        # Crop the image to the specified coordinates
        img = img.crop(CROP_BOX)

        img.save(local_webp_path, 'webp', quality=WEBP_QUALITY)

        logging.info(f"Downloaded, cropped, and converted {file_name} to {webp_filename}.")
        return local_webp_path

    except requests.exceptions.RequestException as req_error:
        logging.error(f"Failed to download {url}: {req_error}")
        return None
    except Exception as conv_error:
        logging.error(f"Failed to convert or save image {file_name}: {conv_error}")
        return None

def main():
    """
    Main function to fetch, download, and process images for the UMV region.
    """
    logging.info(f"--- Starting processing for target: {REGION_NAME.upper()} ---")
    os.makedirs(SAVE_DIR, exist_ok=True)

    # 1. Get list of files from the NOAA directory
    try:
        logging.info(f"Fetching image list from {BASE_URL}...")
        resp = requests.get(BASE_URL, timeout=20)
        resp.raise_for_status()
    except Exception as e:
        logging.error(f"Error fetching directory for {REGION_NAME.upper()}: {e}")
        return # Exit if we can't get the file list

    soup = BeautifulSoup(resp.text, "html.parser")
    files_to_have = sorted([
        link.get("href") for link in soup.find_all("a")
        if link.get("href") and IMAGE_SIZE_FILTER in link.get("href") and "_" in link.get("href")
    ])[-MAX_IMAGES_TO_KEEP:]

    if not files_to_have:
        logging.warning(f"No images matching filter found for {REGION_NAME.upper()}. Exiting.")
        # Write an empty list to JSON to ensure the file is clean
        with open(JSON_FILE, "w") as jf:
            json.dump([], jf)
        return

    logging.info(f"Found {len(files_to_have)} images to process for {REGION_NAME.upper()}.")

    # 2. Concurrently download, convert, and save images
    image_paths = []
    download_task = partial(download_image, base_url=BASE_URL, save_dir=SAVE_DIR)

    with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        results = executor.map(download_task, files_to_have)
        image_paths.extend(path for path in results if path)

    # 3. Clean up old images from the save directory
    successful_files = {os.path.basename(p) for p in image_paths}
    for existing_file in os.listdir(SAVE_DIR):
		# Skip any file that is not a .webp image
        if not existing_file.endswith('.webp'):
            continue
        if existing_file not in successful_files:
            try:
                os.remove(os.path.join(SAVE_DIR, existing_file))
                logging.info(f"Removed old image: {existing_file}")
            except Exception as e:
                logging.error(f"Failed to remove {existing_file}: {e}")

    # 4. Write the final list of relative paths to the JSON file
    final_files_on_disk = sorted([f for f in os.listdir(SAVE_DIR) if f.endswith('.webp')])
    relative_paths = [f"images/{REGION_NAME}/{f}" for f in final_files_on_disk]

    with open(JSON_FILE, "w") as jf:
        json.dump(relative_paths, jf, indent=2)

    if relative_paths:
        logging.info(f"Updated {JSON_FILE} with {len(relative_paths)} image paths.")
    else:
        logging.warning(f"No images were successfully processed for {REGION_NAME.upper()}. Wrote an empty list to {JSON_FILE}.")

    logging.info(f"--- Finished processing for target: {REGION_NAME.upper()} ---")
    logging.info("Script finished.")

if __name__ == "__main__":
    main()
