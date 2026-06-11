from django.db import models
from django.contrib.auth.models import User
from django.conf import settings
from cryptography.fernet import Fernet
import base64
from apps.ai_services.providers import OPENROUTER_MODELS as OPENROUTER_MODEL_CONFIGS


# Supported providers configuration
PROVIDER_CHOICES = [
    ('deepseek', 'DeepSeek'),
    ('qwen', 'Qwen (通义千问)'),
    ('openrouter', 'OpenRouter'),
]

PROVIDER_DEFAULT_MODELS = {
    'deepseek': 'deepseek-v4-pro',
    'qwen': 'qwen-max',
    'openrouter': OPENROUTER_MODEL_CONFIGS[0]['id'],
}

OPENROUTER_MODELS = [model['id'] for model in OPENROUTER_MODEL_CONFIGS]


class UserSettings(models.Model):
    """用户设置，包括加密存储的API密钥"""
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='settings')

    # API Settings - Provider
    api_provider = models.CharField('API Provider', max_length=50, choices=PROVIDER_CHOICES, default='deepseek')

    # API Keys (encrypted) - one per provider
    _encrypted_deepseek_api_key = models.TextField('DeepSeek API Key (加密)', blank=True, default='')
    _encrypted_qwen_api_key = models.TextField('Qwen API Key (加密)', blank=True, default='')
    _encrypted_openrouter_api_key = models.TextField('OpenRouter API Key (加密)', blank=True, default='')
    openrouter_model = models.CharField(
        'OpenRouter Model',
        max_length=100,
        default=PROVIDER_DEFAULT_MODELS['openrouter']
    )

    # AI Settings
    temperature = models.FloatField('Temperature', default=0.7)
    top_p = models.FloatField('Top P', default=1.0)
    max_tokens = models.IntegerField('Max Tokens', default=2000)
    frequency_penalty = models.FloatField('Frequency Penalty', default=0.0)
    presence_penalty = models.FloatField('Presence Penalty', default=0.0)

    # Visual Settings
    THEME_CHOICES = [('dark', 'Dark'), ('light', 'Light')]
    theme = models.CharField('Theme', max_length=20, choices=THEME_CHOICES, default='dark')

    created_at = models.DateTimeField('创建时间', auto_now_add=True)
    updated_at = models.DateTimeField('更新时间', auto_now=True)

    class Meta:
        verbose_name = '用户设置'
        verbose_name_plural = '用户设置'

    def _get_cipher(self):
        """获取加密cipher"""
        # Use SECRET_KEY as encryption key base
        key = base64.urlsafe_b64encode(settings.SECRET_KEY.encode()[:32].ljust(32, b'0'))
        return Fernet(key)

    def _encrypt_value(self, value):
        """加密值"""
        if not value:
            return ''
        cipher = self._get_cipher()
        encrypted = cipher.encrypt(value.encode())
        return encrypted.decode()

    def _decrypt_value(self, encrypted_value):
        """解密值"""
        if not encrypted_value:
            return ''
        try:
            cipher = self._get_cipher()
            decrypted = cipher.decrypt(encrypted_value.encode())
            return decrypted.decode()
        except Exception:
            return ''

    # DeepSeek API Key
    @property
    def deepseek_api_key(self):
        """获取解密后的DeepSeek API密钥"""
        return self._decrypt_value(self._encrypted_deepseek_api_key)

    @deepseek_api_key.setter
    def deepseek_api_key(self, value):
        """设置并加密DeepSeek API密钥"""
        self._encrypted_deepseek_api_key = self._encrypt_value(value)

    # Qwen API Key
    @property
    def qwen_api_key(self):
        """获取解密后的Qwen API密钥"""
        return self._decrypt_value(self._encrypted_qwen_api_key)

    @qwen_api_key.setter
    def qwen_api_key(self, value):
        """设置并加密Qwen API密钥"""
        self._encrypted_qwen_api_key = self._encrypt_value(value)

    # OpenRouter API Key
    @property
    def openrouter_api_key(self):
        """获取解密后的OpenRouter API密钥"""
        return self._decrypt_value(self._encrypted_openrouter_api_key)

    @openrouter_api_key.setter
    def openrouter_api_key(self, value):
        """设置并加密OpenRouter API密钥"""
        self._encrypted_openrouter_api_key = self._encrypt_value(value)

    # Generic methods for any provider
    def get_api_key_for_provider(self, provider=None):
        """获取指定provider的API密钥"""
        provider = provider or self.api_provider
        if provider == 'deepseek':
            return self.deepseek_api_key
        elif provider == 'qwen':
            return self.qwen_api_key
        elif provider == 'openrouter':
            return self.openrouter_api_key
        return ''

    def has_api_key_for_provider(self, provider=None):
        """检查指定provider是否有有效的API密钥"""
        key = self.get_api_key_for_provider(provider)
        return bool(key and key.strip())

    def get_masked_api_key_for_provider(self, provider=None):
        """获取指定provider的脱敏API密钥"""
        key = self.get_api_key_for_provider(provider)
        if not key or len(key) < 8:
            return ''
        return '*' * (len(key) - 4) + key[-4:]

    def get_default_model(self):
        """获取当前provider的默认模型"""
        if self.api_provider == 'openrouter':
            return self.openrouter_model or PROVIDER_DEFAULT_MODELS['openrouter']
        return PROVIDER_DEFAULT_MODELS.get(self.api_provider, 'deepseek-v4-pro')

    # Legacy methods for backward compatibility
    def has_valid_api_key(self):
        """检查当前provider是否有有效的API密钥"""
        return self.has_api_key_for_provider(self.api_provider)

    def get_masked_api_key(self):
        """获取当前provider的脱敏API密钥"""
        return self.get_masked_api_key_for_provider(self.api_provider)

    def __str__(self):
        return f"{self.user.username}'s settings"


class UserEditPrefill(models.Model):
    """用户自定义的编辑指引预设"""
    SCOPE_CHOICES = [
        ('auto_edit', '自动编辑'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='edit_prefills')
    scope = models.CharField('预设类型', max_length=20, choices=SCOPE_CHOICES, default='auto_edit')
    name = models.CharField('名称', max_length=50)  # Max 10 words, ~50 chars
    prompt_text = models.TextField('提示文本', max_length=1000)  # Max 200 words, ~1000 chars
    is_default = models.BooleanField('是否默认（增加细节）', default=False)  # Marks the special "增加细节" that can't be deleted
    order = models.IntegerField('排序', default=0)
    created_at = models.DateTimeField('创建时间', auto_now_add=True)
    updated_at = models.DateTimeField('更新时间', auto_now=True)

    class Meta:
        verbose_name = '编辑指引预设'
        verbose_name_plural = '编辑指引预设'
        ordering = ['order', 'created_at']
        unique_together = [['user', 'scope', 'name']]  # Each user can't have duplicate names in same scope

    def __str__(self):
        return f"{self.user.username}'s {self.name}"
