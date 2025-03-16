<div align="center">
<img src="./assets/img/banner-en.png" />

<h1>NexusGate</h1>
Monitor and manage your Agent applications with just one line of code

[![GitHub license](https://img.shields.io/github/license/geektechx/nexusgate)](https://github.com/geektechx/nexusgate/blob/main/LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/geektechx/nexusgate)](https://github.com/geektechx/nexusgate/stargazers)
[![GitHub issues](https://img.shields.io/github/issues/geektechx/nexusgate)](https://github.com/geektechx/nexusgate/issues)
[![Free Use](https://img.shields.io/badge/free-pricing?logo=free&color=%20%23155EEF&label=pricing&labelColor=%20%23528bff)](https://img.shields.io/badge/free-pricing?logo=free&color=%20%23155EEF&label=pricing&labelColor=%20%23528bff)
</div>

<div align="right">
  <a href="README.md">中文</a>
</div>

- [🚀 Introduction](#-introduction)
- [🌟 Key Features](#-key-features)
- [🚀 Quick Start](#-quick-start)
- [🔍 System Features](#-system-features)
- [👨‍💻 For Developers](#-for-developers)
- [👨‍💼 For Administrators](#-for-administrators)
- [🗺️ Roadmap](#%EF%B8%8F-roadmap)
- [📝 License](#-license)
- [🤝 Contributing](#-contributing)
- [📚 Documentation](#-documentation)

---

## 🚀 Introduction

NexusGate is a monitoring and management platform for Agent applications. It helps Agent applications understand user feedback without additional development, accelerating the optimization and iteration lifecycle.

With NexusGate, you only need to modify one line of code to monitor, manage, and optimize your Agent applications. It also helps enterprises establish internal intelligence infrastructure through out-of-the-box, one-click setup.

## ✨ Key Features

- **Comprehensive LLM Management**: Focus on your AI applications through a unified management system to improve quality, reduce costs, decrease latency, and ensure security. Compatible with all mainstream large language model services and inference frameworks.

- **Evaluation and Iteration**: Leverage powerful tools and insights to analyze, modify, and iterate downstream LLM applications.

- **Production Monitoring**: Record all production interactions for monitoring, analysis, debugging, and optimization.

- **Enterprise-Grade Management**: Manage downstream applications with one click, providing metering and auditing of LLM content.

## 🐳 Quick Start

NexusGate provides a Docker Compose configuration supporting both ARM and x86 architectures.

```bash
wget https://github.com/geektechx/NexusGate/raw/refs/heads/main/docker-compose.yaml
nano docker-compose.yaml # Or use other text editors
docker compose up -d
```

## 🔍 System Features

### 1. Upstream Management

Connect and manage multiple LLM providers, including enterprise model servers or public model service providers (DeepSeek, Aliyun Qianwen, etc.).

![Create Upstream Configuration](./assets/img/upstream-config.webp)

NexusGate supports over 20 tested upstream services and deployment frameworks, while supporting multiple downstream applications, giving you flexibility and choice.

### 2. Comprehensive Logging

Monitor detailed information of all interactions, including request timestamps, status, input prompts, generated content, model information, token usage, latency metrics, and user feedback.

![History with Conversation Details Sidebar](./assets/img/history-log-details.webp)

The system provides an admin view of all API key chat logs and history records for specific API keys, with a detailed sidebar view of request details and conversation context.

![History Display](./assets/img/history-table.webp)

### 3. Application Management

Control and configure downstream applications through API key creation and management, user-friendly naming conventions, expiration settings, and visibility controls.

![Create Application with API Key Settings](./assets/img/create-application.webp)

## 👨‍💻 For Developers

### One-Line Code Integration

Integrate NexusGate into your existing LLM applications with just one line of code modification:

#### Python (Using OpenAI library)

```python
# Before:
from openai import OpenAI
client = OpenAI(api_key="your-openai-api-key")

# After:
from openai import OpenAI
client = OpenAI(api_key="your-nexusgate-api-key", base_url="https://your-nexusgate-server/v1")
```

#### JavaScript/TypeScript

```javascript
// Before:
import OpenAI from 'openai';
const openai = new OpenAI({ apiKey: 'your-openai-api-key' });

// After:
import OpenAI from 'openai';
const openai = new OpenAI({ 
  apiKey: 'your-nexusgate-api-key',
  baseURL: 'https://your-nexusgate-server/v1'
});
```

### API Documentation

NexusGate provides comprehensive OpenAPI documentation for easy integration with your existing systems and workflows. You can access the OpenAPI specification at:

```
https://your-nexusgate-server/swagger
```

The documentation includes all available endpoints, request/response formats, and authentication requirements, enabling developers to quickly understand and utilize all of NexusGate's capabilities.

## 👨‍💼 For Administrators

### Centralized LLM Management

NexusGate provides a unified dashboard for managing all LLM applications in your organization:

- **Cost Control**: Track token usage across all applications and providers
- **Security Oversight**: Monitor all prompts and completions to ensure compliance and data protection
- **Performance Optimization**: Identify bottlenecks and optimize response times
- **Usage Analytics**: Understand how different teams and applications are utilizing LLM resources

### Application Management

Control and configure downstream applications, offering flexible expiration settings for enhanced security, rate limits and usage limits for cost control, and granular permissions for different models and features.

## 🗺️ Roadmap

We're constantly adding new features and capabilities to NexusGate. Here's what we're working on next:

- [ ] 🌐 Internationalization: Complete i18n support with official Chinese language support.
- [ ] 📊 Enhanced Analytics: Expand our monitoring metrics including success rates, request volumes, token usage statistics, request completion rates, Agent usage rankings, model usage rankings, error analysis, full-chain latency, inference latency, and throughput measurements.
- [ ] 🔄 Prometheus Integration: Create comprehensive overview dashboards by integrating with external Prometheus instances to monitor server hardware, inference frameworks, and other information sources.
- [ ] 🚦 Traffic Control: Implement fine-grained traffic management for each API key, including quotas and priorities for specific models, enabling administrators to precisely control resource allocation.
- [ ] 💡 Manual Reporting SDK: Develop SDKs for more granular tracking that can be embedded directly in developer code, enabling more detailed monitoring such as end-user analytics.
- [ ] 👍 Feedback System: Build robust feedback mechanisms to collect and analyze user responses to AI-generated content.
- [ ] 💬 Prompt Management: Create tools for prompt creation, optimization, and batch testing, helping developers craft more effective interactions with LLMs.
  - [ ] 🧠 Automated Evaluation: Leverage LLMs to automatically evaluate outputs and provide quality metrics without human intervention.
  - [ ] 📚 Dataset Creation and Fine-tuning: Implement dataset management and model fine-tuning pipelines, one-click import to [LLaMa Factory](https://github.com/hiyouga/LLaMA-Factory) for fine-tuning, and monitoring using [SwanLab](https://github.com/SwanHubX/SwanLab).
- [ ] 🛠️ Tool Integration: Add capabilities to models without built-in tools (like web search) by implementing functionality at the gateway layer and exposing it through standard API interfaces.

## 📝 License

[Apache License 2.0](LICENSE)

## 🤝 Contributing

We welcome developers of all skill levels to contribute! Whether it's fixing bugs, adding features, or improving documentation, your input is valuable.

>Please check out [CONTRIBUTING.md](CONTRIBUTING.md) to learn how to get started.

**Contributors**

<img src="https://contrib.rocks/image?repo=GeekTechX/NexusGate" />

## 📚 Documentation

For more detailed information, visit our [official documentation](https://docs.nexusgate.io).
