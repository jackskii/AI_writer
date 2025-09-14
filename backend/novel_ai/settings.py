"""
Django settings for novel_ai project.
"""

from pathlib import Path
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

# Security settings
SECRET_KEY = os.environ.get('SECRET_KEY', 'django-insecure-0#rt!guz40l1*_99@)_&c3#ztdx_@f=02hvpx9@$159n3fk8cy')
DEBUG = os.environ.get('DEBUG', 'True').lower() == 'true'
ALLOWED_HOSTS = ['localhost', '127.0.0.1']

# Application definition
DJANGO_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
]

THIRD_PARTY_APPS = [
    'rest_framework',
    'corsheaders',
    'channels',
    # 'django_filters',
    # 'drf_spectacular',
]

LOCAL_APPS = [
    'apps.works',
    'apps.ai_services',
    'apps.chat',
    'apps.notes',
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'novel_ai.urls'
ASGI_APPLICATION = 'novel_ai.asgi.application'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'novel_ai.wsgi.application'
# ASGI_APPLICATION = 'novel_ai.asgi.application'  # Will add after installing channels

# Database - using SQLite for initial setup
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}

# PostgreSQL configuration (commented for now)
# DATABASES = {
#     'default': {
#         'ENGINE': 'django.db.backends.postgresql',
#         'NAME': config('DB_NAME', default='novel_ai_db'),
#         'USER': config('DB_USER', default='novel_user'),
#         'PASSWORD': config('DB_PASSWORD', default='novel_password'),
#         'HOST': config('DB_HOST', default='localhost'),
#         'PORT': config('DB_PORT', default='5432'),
#     }
# }

# Advanced configurations (commented for initial setup)

# # Channels Redis
# CHANNEL_LAYERS = {
#     'default': {
#         'BACKEND': 'channels_redis.core.RedisChannelLayer',
#         'CONFIG': {
#             "hosts": [config('REDIS_URL', default='redis://localhost:6379/0')],
#         },
#     },
# }

# # Celery Configuration
# CELERY_BROKER_URL = config('REDIS_URL', default='redis://localhost:6379/0')
# CELERY_RESULT_BACKEND = config('REDIS_URL', default='redis://localhost:6379/0')

# REST Framework
REST_FRAMEWORK = {
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 20,
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework.authentication.SessionAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.AllowAny',
    ],
}

# # Spectacular settings
# SPECTACULAR_SETTINGS = {
#     'TITLE': 'Novel AI API',
#     'DESCRIPTION': 'AI-powered novel writing assistant API',
#     'VERSION': '1.0.0',
#     'SERVE_INCLUDE_SCHEMA': False,
# }

# CORS settings
CORS_ALLOWED_ORIGINS = [
    'http://localhost:3000',
    'http://localhost:3001',
]

CORS_ALLOW_CREDENTIALS = True

# Password validation
AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]

# Internationalization
LANGUAGE_CODE = 'zh-hans'
TIME_ZONE = 'Asia/Shanghai'
USE_I18N = True
USE_TZ = True

# Static files
STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

# Media files
MEDIA_URL = 'media/'
MEDIA_ROOT = BASE_DIR / 'media'

# Default primary key field type
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# Django Channels Configuration
CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels_redis.core.RedisChannelLayer",
        "CONFIG": {
            "hosts": [os.environ.get('REDIS_URL', 'redis://localhost:6380/0')],
        },
    },
}

# DeepSeek API Configuration
DEEPSEEK_API_KEY = os.environ.get('DEEPSEEK_API_KEY', '')
DEEPSEEK_API_BASE = os.environ.get('DEEPSEEK_API_BASE', 'https://api.deepseek.com/v1')

# Auto-save settings
AUTO_SAVE_INTERVAL = 5  # seconds
SUGGESTION_TRIGGER_WORDS = 300  # words before triggering auto-suggestion

# Logging
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '{levelname} {asctime} {module} {process:d} {thread:d} {message}',
            'style': '{',
        },
    },
    'handlers': {
        'file': {
            'level': 'INFO',
            'class': 'logging.FileHandler',
            'filename': BASE_DIR / 'logs' / 'django.log',
            'formatter': 'verbose',
        },
        'console': {
            'level': 'INFO',
            'class': 'logging.StreamHandler',
            'formatter': 'verbose',
        },
    },
    'loggers': {
        'django': {
            'handlers': ['file', 'console'],
            'level': 'INFO',
            'propagate': True,
        },
        'novel_ai': {
            'handlers': ['file', 'console'],
            'level': 'INFO',
            'propagate': True,
        },
        'ai_services': {
            'handlers': ['file', 'console'],
            'level': 'DEBUG',
            'propagate': True,
        },
    },
}

# Ensure logs directory exists
os.makedirs(BASE_DIR / 'logs', exist_ok=True)