import os
from datetime import datetime, timezone
from urllib.parse import quote_plus, urlencode

from authlib.integrations.flask_client import OAuth
from bson import ObjectId
from dotenv import load_dotenv
from flask import Flask, jsonify, redirect, render_template, request, session, url_for
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure, OperationFailure
from werkzeug.middleware.proxy_fix import ProxyFix

# follow system
#def main():
    


