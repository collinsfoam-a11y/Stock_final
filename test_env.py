import os
from dotenv import load_dotenv
load_dotenv('backend/.env')
from backend.config import settings
print(settings.SQL_SERVER_HOST)
print(settings.SQL_SERVER_DATABASE)
print(settings.SQL_SERVER_USER)
print(settings.SQL_SERVER_PASSWORD)
