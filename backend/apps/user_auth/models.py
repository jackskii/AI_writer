from django.db import models
from django.contrib.auth.models import User
from django.conf import settings
from cryptography.fernet import Fernet
import base64


class UserSettings(models.Model):
    """用户设置，包括加密存储的API密钥"""
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='settings')

    # API Settings
    _encrypted_deepseek_api_key = models.TextField('DeepSeek API Key (加密)', blank=True, default='')
    api_provider = models.CharField('API Provider', max_length=50, default='deepseek')

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

    @property
    def deepseek_api_key(self):
        """获取解密后的API密钥"""
        if not self._encrypted_deepseek_api_key:
            return ''
        try:
            cipher = self._get_cipher()
            decrypted = cipher.decrypt(self._encrypted_deepseek_api_key.encode())
            return decrypted.decode()
        except Exception:
            return ''

    @deepseek_api_key.setter
    def deepseek_api_key(self, value):
        """设置并加密API密钥"""
        if not value:
            self._encrypted_deepseek_api_key = ''
        else:
            cipher = self._get_cipher()
            encrypted = cipher.encrypt(value.encode())
            self._encrypted_deepseek_api_key = encrypted.decode()

    def has_valid_api_key(self):
        """检查是否有有效的API密钥"""
        key = self.deepseek_api_key
        return bool(key and key.strip())

    def get_masked_api_key(self):
        """获取脱敏的API密钥（只显示最后4位）"""
        key = self.deepseek_api_key
        if not key or len(key) < 8:
            return ''
        return '*' * (len(key) - 4) + key[-4:]

    def __str__(self):
        return f"{self.user.username}'s settings"
