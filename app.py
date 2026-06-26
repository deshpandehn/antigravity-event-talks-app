import datetime
import logging
import os
import xml.etree.ElementTree as ET
from urllib.parse import quote

import requests
from bs4 import BeautifulSoup
from flask import Flask, jsonify, render_template, request

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

FEED_URL = "https://docs.cloud.google.com/feeds/bigquery-release-notes.xml"

# In-memory cache for parsed release notes
cache = {
    "data": None,
    "last_fetched": None
}
CACHE_DURATION = datetime.timedelta(hours=1)

def parse_feed_content(xml_data):
    """
    Parses the Atom XML feed data and extracts individual release items.
    Each entry is split into sub-items based on <h3> headers inside the HTML content.
    """
    try:
        root = ET.fromstring(xml_data)
    except ET.ParseError as e:
        logger.error(f"XML Parsing Error: {e}")
        return []

    ns = {'atom': 'http://www.w3.org/2005/Atom'}
    parsed_items = []
    
    # Process each <entry>
    for entry in root.findall('atom:entry', ns):
        entry_title = entry.find('atom:title', ns)
        entry_title_text = entry_title.text.strip() if entry_title is not None else ""
        
        entry_updated = entry.find('atom:updated', ns)
        entry_updated_text = entry_updated.text.strip() if entry_updated is not None else ""
        
        link_el = entry.find("atom:link[@rel='alternate']", ns)
        entry_link = link_el.attrib.get('href', '').strip() if link_el is not None else ""
        
        content_el = entry.find('atom:content', ns)
        if content_el is None or not content_el.text:
            continue
            
        content_html = content_el.text.strip()
        soup = BeautifulSoup(content_html, 'html.parser')
        
        current_type = None
        current_content_nodes = []
        entry_item_index = 0
        
        def save_current_item():
            nonlocal entry_item_index
            if not current_type:
                return
            
            # Combine raw elements to get HTML
            item_html = "".join(str(node) for node in current_content_nodes).strip()
            
            # Extract clean plain text for search and social sharing
            item_text = "".join(
                node.get_text() if hasattr(node, 'get_text') else str(node) 
                for node in current_content_nodes
            ).strip()
            
            # Generate a unique slug for this item
            safe_title = entry_title_text.replace(" ", "_").replace(",", "")
            item_id = f"{safe_title}_{current_type.lower()}_{entry_item_index}"
            
            parsed_items.append({
                "id": item_id,
                "date": entry_title_text,
                "updated_iso": entry_updated_text,
                "type": current_type,
                "html": item_html,
                "text": item_text,
                "link": entry_link
            })
            entry_item_index += 1

        # Traverse the top-level HTML nodes inside the content
        for child in soup.contents:
            if child.name == 'h3':
                # Save previous item before starting a new one
                save_current_item()
                current_type = child.get_text().strip()
                current_content_nodes = []
            else:
                if current_type:
                    current_content_nodes.append(child)
                else:
                    # Content found before any h3 (e.g. random text, intro)
                    # We can assign a default type 'General'
                    current_type = "General"
                    current_content_nodes.append(child)
                    
        # Save the last item
        save_current_item()
        
    return parsed_items

def get_release_notes(force_refresh=False):
    """
    Fetches the feed from Google Cloud. Uses cached results if within CACHE_DURATION
    unless force_refresh is True.
    """
    now = datetime.datetime.now()
    if not force_refresh and cache["data"] and cache["last_fetched"] and (now - cache["last_fetched"]) < CACHE_DURATION:
        logger.info("Serving release notes from cache")
        return cache["data"], None

    logger.info("Fetching fresh release notes from Google Cloud")
    try:
        response = requests.get(FEED_URL, timeout=15)
        response.raise_for_status()
    except requests.RequestException as e:
        logger.error(f"Network error while fetching feed: {e}")
        # If network error but we have stale cache, serve cache as fallback
        if cache["data"]:
            logger.info("Serving stale cache as fallback due to network failure")
            return cache["data"], f"Failed to fetch updates, showing cached data from {cache['last_fetched'].strftime('%Y-%m-%d %H:%M:%S')}."
        return [], f"Failed to fetch release notes: {str(e)}"
        
    data = parse_feed_content(response.text)
    if data:
        cache["data"] = data
        cache["last_fetched"] = now
        return data, None
    else:
        # Parsing failed or feed empty
        if cache["data"]:
            return cache["data"], "Failed to parse fresh updates, showing cached data."
        return [], "Failed to parse feed data."

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/release-notes')
def api_release_notes():
    force_refresh = request.args.get('refresh', 'false').lower() == 'true'
    data, error = get_release_notes(force_refresh=force_refresh)
    
    if error and not data:
        return jsonify({"success": False, "error": error}), 500
        
    # Return release notes with metadata
    return jsonify({
        "success": True,
        "error": error,
        "last_updated": cache["last_fetched"].isoformat() if cache["last_fetched"] else None,
        "data": data
    })

if __name__ == '__main__':
    # Run server on port 5000
    app.run(debug=True, host='127.0.0.1', port=5000)
