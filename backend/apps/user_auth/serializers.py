from rest_framework import serializers
from django.contrib.auth.models import User
from django.contrib.auth import authenticate
from .models import UserSettings, UserEditPrefill


class UserRegistrationSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=6)
    password_confirm = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ('username', 'email', 'password', 'password_confirm', 'first_name', 'last_name')

    def validate_email(self, email):
        if User.objects.filter(email=email).exists():
            raise serializers.ValidationError("该邮箱已被注册")
        return email

    def validate_username(self, username):
        if User.objects.filter(username=username).exists():
            raise serializers.ValidationError("该用户名已被注册")
        return username

    def validate(self, attrs):
        if attrs['password'] != attrs['password_confirm']:
            raise serializers.ValidationError("密码不匹配")
        return attrs

    def create(self, validated_data):
        validated_data.pop('password_confirm')
        user = User.objects.create_user(**validated_data)
        return user


class UserLoginSerializer(serializers.Serializer):
    username = serializers.CharField(help_text="用户名或邮箱")
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        username_or_email = attrs.get('username')
        password = attrs.get('password')

        # Get request from context (needed for Django Axes)
        request = self.context.get('request')

        if username_or_email and password:
            # Try to find user by username first
            user = authenticate(request=request, username=username_or_email, password=password)

            # If not found, try to find user by email
            if not user:
                try:
                    user_obj = User.objects.get(email=username_or_email)
                    user = authenticate(request=request, username=user_obj.username, password=password)
                except User.DoesNotExist:
                    pass

            if not user:
                raise serializers.ValidationError('用户名/邮箱或密码错误')
            if not user.is_active:
                raise serializers.ValidationError('用户账户已被禁用')
            attrs['user'] = user
        else:
            raise serializers.ValidationError('请提供用户名/邮箱和密码')

        return attrs


class UserSerializer(serializers.ModelSerializer):
    works_count = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ('id', 'username', 'email', 'first_name', 'last_name', 'date_joined', 'works_count')
        read_only_fields = ('id', 'date_joined', 'works_count')

    def get_works_count(self, obj):
        return obj.works.count()


class UserSettingsSerializer(serializers.ModelSerializer):
    # API Keys - write-only for setting, separate for each provider
    deepseek_api_key = serializers.CharField(write_only=True, required=False, allow_blank=True)
    qwen_api_key = serializers.CharField(write_only=True, required=False, allow_blank=True)

    # Masked API keys - read-only for display
    masked_deepseek_api_key = serializers.SerializerMethodField(read_only=True)
    masked_qwen_api_key = serializers.SerializerMethodField(read_only=True)

    # Has API key flags - read-only
    has_deepseek_api_key = serializers.SerializerMethodField(read_only=True)
    has_qwen_api_key = serializers.SerializerMethodField(read_only=True)

    # Legacy fields for backward compatibility
    masked_api_key = serializers.SerializerMethodField(read_only=True)
    has_api_key = serializers.SerializerMethodField(read_only=True)

    # AI Settings with validation
    temperature = serializers.FloatField(min_value=0.0, max_value=2.0, required=False)
    top_p = serializers.FloatField(min_value=0.0, max_value=1.0, required=False)
    max_tokens = serializers.IntegerField(min_value=100, max_value=8000, required=False)
    frequency_penalty = serializers.FloatField(min_value=-2.0, max_value=2.0, required=False)
    presence_penalty = serializers.FloatField(min_value=-2.0, max_value=2.0, required=False)

    class Meta:
        model = UserSettings
        fields = (
            # API Settings
            'api_provider',
            'deepseek_api_key', 'masked_deepseek_api_key', 'has_deepseek_api_key',
            'qwen_api_key', 'masked_qwen_api_key', 'has_qwen_api_key',
            # Legacy fields
            'masked_api_key', 'has_api_key',
            # AI Settings
            'temperature', 'top_p', 'max_tokens', 'frequency_penalty', 'presence_penalty',
            # Visual Settings
            'theme',
            # Meta
            'updated_at'
        )
        read_only_fields = (
            'masked_deepseek_api_key', 'masked_qwen_api_key',
            'has_deepseek_api_key', 'has_qwen_api_key',
            'masked_api_key', 'has_api_key',
            'updated_at'
        )

    # DeepSeek API key methods
    def get_masked_deepseek_api_key(self, obj):
        """返回脱敏后的DeepSeek API密钥"""
        return obj.get_masked_api_key_for_provider('deepseek')

    def get_has_deepseek_api_key(self, obj):
        """返回是否有有效的DeepSeek API密钥"""
        return obj.has_api_key_for_provider('deepseek')

    # Qwen API key methods
    def get_masked_qwen_api_key(self, obj):
        """返回脱敏后的Qwen API密钥"""
        return obj.get_masked_api_key_for_provider('qwen')

    def get_has_qwen_api_key(self, obj):
        """返回是否有有效的Qwen API密钥"""
        return obj.has_api_key_for_provider('qwen')

    # Legacy methods (for current provider)
    def get_masked_api_key(self, obj):
        """返回当前provider脱敏后的API密钥"""
        return obj.get_masked_api_key()

    def get_has_api_key(self, obj):
        """返回当前provider是否有有效的API密钥"""
        return obj.has_valid_api_key()

    def update(self, instance, validated_data):
        """更新设置"""
        # Handle DeepSeek API key separately (encrypted)
        if 'deepseek_api_key' in validated_data:
            api_key = validated_data.pop('deepseek_api_key')
            instance.deepseek_api_key = api_key

        # Handle Qwen API key separately (encrypted)
        if 'qwen_api_key' in validated_data:
            api_key = validated_data.pop('qwen_api_key')
            instance.qwen_api_key = api_key

        # Update all other fields
        for field, value in validated_data.items():
            setattr(instance, field, value)

        instance.save()
        return instance


class UserEditPrefillSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserEditPrefill
        fields = ('id', 'name', 'prompt_text', 'is_default', 'order', 'created_at', 'updated_at')
        read_only_fields = ('id', 'is_default', 'created_at', 'updated_at')

    def validate_name(self, value):
        """Validate name length (max 10 words)"""
        if not value or not value.strip():
            raise serializers.ValidationError("名称不能为空")
        words = value.strip().split()
        if len(words) > 10:
            raise serializers.ValidationError("名称最多10个字")
        if len(value) > 50:
            raise serializers.ValidationError("名称过长")
        return value.strip()

    def validate_prompt_text(self, value):
        """Validate prompt text length (max 200 words)"""
        if not value or not value.strip():
            raise serializers.ValidationError("提示文本不能为空")
        words = value.strip().split()
        if len(words) > 200:
            raise serializers.ValidationError("提示文本最多200字")
        if len(value) > 1000:
            raise serializers.ValidationError("提示文本过长")
        return value.strip()

    def validate(self, attrs):
        """Check for duplicate names within the same user"""
        user = self.context['request'].user
        name = attrs.get('name', self.instance.name if self.instance else None)
        
        if name:
            existing = UserEditPrefill.objects.filter(user=user, name=name)
            if self.instance:
                existing = existing.exclude(id=self.instance.id)
            if existing.exists():
                raise serializers.ValidationError({'name': '该名称已存在'})
        
        return attrs