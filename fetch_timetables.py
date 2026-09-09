#!/usr/bin/env python3
"""
Deutsche Bahn Timetables API Client
Fetches all timetable data for today from the Timetables API
"""

import os
import json
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, Dict, Any
import sys

try:
    import requests
except ImportError:
    print("Error: 'requests' library not installed. Install with: pip install requests")
    sys.exit(1)


class TimetablesClient:
    """Client for Deutsche Bahn Timetables API"""
    
    BASE_URL = "https://apis.deutschebahn.com/db-api-marketplace/apis/timetables/v1"
    
    def __init__(self, client_id: str, client_key: str):
        """Initialize client with credentials"""
        self.client_id = client_id
        self.client_key = client_key
        self.session = requests.Session()
        # Set custom headers for API authentication
        self.session.headers.update({
            "DB-Client-ID": client_id,
            "DB-Api-Key": client_key
        })
    
    def get_planned_data(self, eva_no: str, date: str, hour: str) -> Optional[Dict[str, Any]]:
        """
        Fetch planned timetable data for a station at a specific hour
        
        Args:
            eva_no: Station EVA number (e.g., '8000105' for Berlin Hbf)
            date: Date in YYMMDD format
            hour: Hour in HH format (00-23)
        
        Returns:
            Parsed XML as dictionary or None on error
        """
        url = f"{self.BASE_URL}/plan/{eva_no}/{date}/{hour}"
        
        try:
            response = self.session.get(url, timeout=10)
            response.raise_for_status()
            
            # Parse XML response
            root = ET.fromstring(response.content)
            return self._parse_xml_to_dict(root)
        
        except requests.exceptions.RequestException as e:
            print(f"Error fetching {url}: {e}")
            return None
    
    def get_full_changes(self, eva_no: str) -> Optional[Dict[str, Any]]:
        """
        Fetch all known changes for a station
        
        Args:
            eva_no: Station EVA number
        
        Returns:
            Parsed XML as dictionary or None on error
        """
        url = f"{self.BASE_URL}/fchg/{eva_no}"
        
        try:
            response = self.session.get(url, timeout=10)
            response.raise_for_status()
            root = ET.fromstring(response.content)
            return self._parse_xml_to_dict(root)
        
        except requests.exceptions.RequestException as e:
            print(f"Error fetching {url}: {e}")
            return None
    
    def get_recent_changes(self, eva_no: str) -> Optional[Dict[str, Any]]:
        """
        Fetch recent changes (last 2 minutes) for a station
        
        Args:
            eva_no: Station EVA number
        
        Returns:
            Parsed XML as dictionary or None on error
        """
        url = f"{self.BASE_URL}/rchg/{eva_no}"
        
        try:
            response = self.session.get(url, timeout=10)
            response.raise_for_status()
            root = ET.fromstring(response.content)
            return self._parse_xml_to_dict(root)
        
        except requests.exceptions.RequestException as e:
            print(f"Error fetching {url}: {e}")
            return None
    
    @staticmethod
    def _parse_xml_to_dict(element: ET.Element) -> Dict[str, Any]:
        """Convert XML element to dictionary"""
        result = {}
        
        # Add attributes
        if element.attrib:
            result.update(element.attrib)
        
        # Add child elements
        for child in element:
            child_data = TimetablesClient._parse_xml_to_dict(child)
            
            if child.tag in result:
                # Convert to list if multiple elements with same tag
                if not isinstance(result[child.tag], list):
                    result[child.tag] = [result[child.tag]]
                result[child.tag].append(child_data)
            else:
                result[child.tag] = child_data
        
        # If no children and no text, return empty dict
        if not result and element.text and element.text.strip():
            return element.text.strip()
        
        return result if result else (element.text.strip() if element.text else "")


def load_env_credentials() -> tuple[str, str]:
    """Load CLIENT_ID and CLIENT_KEY from .env.local"""
    env_path = Path(".env.local")
    
    if not env_path.exists():
        raise FileNotFoundError(".env.local not found. Please create it with CLIENT_ID and CLIENT_KEY")
    
    credentials = {}
    with open(env_path, "r") as f:
        for line in f:
            line = line.strip()
            if line and "=" in line:
                key, value = line.split("=", 1)
                credentials[key.strip()] = value.strip()
    
    client_id = credentials.get("CLIENT_ID")
    client_key = credentials.get("CLIENT_KEY")
    
    if not client_id or not client_key:
        raise ValueError("CLIENT_ID or CLIENT_KEY not found in .env.local")
    
    return client_id, client_key


def get_today_date_formatted() -> str:
    """Get today's date in YYMMDD format"""
    today = datetime.now()
    return today.strftime("%y%m%d")


def fetch_all_today_data(eva_no: str = "8000105", output_file: Optional[str] = None):
    """
    Fetch all timetable data for today (all 24 hours)
    
    Args:
        eva_no: Station EVA number (default: 8000105 = Berlin Hbf)
        output_file: Optional file path to save results as JSON
    """
    try:
        # Load credentials
        print("Loading credentials from .env.local...")
        client_id, client_key = load_env_credentials()
        
        # Initialize client
        client = TimetablesClient(client_id, client_key)
        
        # Get today's date
        today_date = get_today_date_formatted()
        print(f"Fetching timetable data for station {eva_no} on {today_date}")
        print("=" * 60)
        
        all_data = {
            "station_eva": eva_no,
            "date": today_date,
            "timestamp": datetime.now().isoformat(),
            "hourly_data": {}
        }
        
        # Fetch data for all 24 hours
        for hour in range(24):
            hour_str = f"{hour:02d}"
            print(f"Fetching hour {hour_str}...", end=" ", flush=True)
            
            data = client.get_planned_data(eva_no, today_date, hour_str)
            
            if data:
                all_data["hourly_data"][hour_str] = data
                print("✓")
            else:
                print("✗")
                all_data["hourly_data"][hour_str] = None
        
        print("=" * 60)
        print(f"Total hours fetched: {len([h for h in all_data['hourly_data'].values() if h])}/24")
        
        # Save to file if specified
        if output_file:
            output_path = Path(output_file)
            output_path.parent.mkdir(parents=True, exist_ok=True)
            
            with open(output_path, "w", encoding="utf-8") as f:
                json.dump(all_data, f, indent=2, ensure_ascii=False)
            
            print(f"Data saved to: {output_path}")
        
        # Print summary
        print("\nSample data from hour 00:")
        if all_data["hourly_data"]["00"]:
            print(json.dumps(all_data["hourly_data"]["00"], indent=2)[:500] + "...")
        
        return all_data
    
    except FileNotFoundError as e:
        print(f"Error: {e}")
        sys.exit(1)
    except ValueError as e:
        print(f"Error: {e}")
        sys.exit(1)


def fetch_and_display_changes(eva_no: str = "8000105"):
    """Fetch and display current changes for a station"""
    try:
        print("Loading credentials from .env.local...")
        client_id, client_key = load_env_credentials()
        client = TimetablesClient(client_id, client_key)
        
        print(f"Fetching full changes for station {eva_no}...")
        changes = client.get_full_changes(eva_no)
        
        if changes:
            print("\nFull Changes:")
            print(json.dumps(changes, indent=2)[:1000] + "...")
        
        print(f"\nFetching recent changes for station {eva_no}...")
        recent = client.get_recent_changes(eva_no)
        
        if recent:
            print("\nRecent Changes (last 2 minutes):")
            print(json.dumps(recent, indent=2)[:1000] + "...")
    
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(
        description="Fetch Deutsche Bahn timetable data"
    )
    parser.add_argument(
        "--eva",
        default="8000105",
        help="Station EVA number (default: 8000105 = Berlin Hbf)"
    )
    parser.add_argument(
        "--output",
        default="timetable_data_today.json",
        help="Output file for JSON results (default: timetable_data_today.json)"
    )
    parser.add_argument(
        "--changes",
        action="store_true",
        help="Fetch changes instead of planned data"
    )
    
    args = parser.parse_args()
    
    if args.changes:
        fetch_and_display_changes(args.eva)
    else:
        fetch_all_today_data(args.eva, args.output)
