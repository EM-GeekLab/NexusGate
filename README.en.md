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

- **Evaluation and Iteration**: Leverage powerful tools and insights to analyze, modify, and iterate platform-integrated LLM applications.

- **Production Monitoring**: Record all production interactions for monitoring, analysis, debugging, and optimization.

- **Enterprise-Grade Management**: Manage applications integrated via NexusGate with one click, providing metering and auditing of LLM content.

## 🐳 Quick Start

NexusGate provides a Docker Compose configuration supporting both ARM and x86 architectures.

```bash
wget https://github.com/geektechx/NexusGate/raw/refs/heads/main/docker-compose.yaml
nano docker-compose.yaml # Or use other text editors
docker compose up -d
```

## 🔍 System Features

### 1. Model Layer Management

Connect and manage multiple LLM providers,such as:
- Public Cloud Services: OpenAI, DeepSeek, Alibaba Qwen
- Enterprise Private Models: Large Model All-in-One Machine

NexusGate supports over 20 tested model services and deployment frameworks, while supporting multiple integrable client applications, giving you flexibility and choice.
![Create Model Layer Configuration](./assets/img/upstream-config.webp)
*Figure 1.1: Creating Model Layer Configuration*

>*You can also view the example below for more details.*

<details>
 <summary><mark>Click to view example video:Configure a Model</mark></summary>
 <video controls src="https://private-user-images.githubusercontent.com/20714618/423244526-7c3aec03-c288-494d-a08c-aec5c92c509a.mp4?jwt=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJnaXRodWIuY29tIiwiYXVkIjoicmF3LmdpdGh1YnVzZXJjb250ZW50LmNvbSIsImtleSI6ImtleTUiLCJleHAiOjE3NDIyMDAyOTgsIm5iZiI6MTc0MjE5OTk5OCwicGF0aCI6Ii8yMDcxNDYxOC80MjMyNDQ1MjYtN2MzYWVjMDMtYzI4OC00OTRkLWEwOGMtYWVjNWM5MmM1MDlhLm1wND9YLUFtei1BbGdvcml0aG09QVdTNC1ITUFDLVNIQTI1NiZYLUFtei1DcmVkZW50aWFsPUFLSUFWQ09EWUxTQTUzUFFLNFpBJTJGMjAyNTAzMTclMkZ1cy1lYXN0LTElMkZzMyUyRmF3czRfcmVxdWVzdCZYLUFtei1EYXRlPTIwMjUwMzE3VDA4MjYzOFomWC1BbXotRXhwaXJlcz0zMDAmWC1BbXotU2lnbmF0dXJlPTIzMjg0YTY1ODFkODI3Y2JhZDZmMGQ2ZDUzYWM4NTlmNTExZDA1OTgzOTk1ODlmNjMwYTRhZjhiNmM5NzEwMGEmWC1BbXotU2lnbmVkSGVhZGVycz1ob3N0In0.OZxdZhFUnK8cylHu2de_gLXQmiyNzDGJw42mWD7b4N4" title="Configure a Model"></video>
</details>

### 2. Comprehensive Logging

Monitor detailed information of all interactions, including:
- Request timestamps and status.
- Input prompts and generated content.
- Model information and token usage.
- Latency metrics and user feedback.

The system provides an admin view of all API key chat logs and history records for specific API keys, with a detailed sidebar view of request details and conversation context.

![History with Conversation Details Sidebar](./assets/img/history-log-details.webp)
*Figure 2.1: Conversation Details Sidebar*

![History Display](./assets/img/history-table.webp)
*Figure 2.2: Historical Display*

### 3. Application Management

Control and configure platform-integrated applications:
- API key creation and management.
- user-friendly naming conventions.
- expiration settings and visibility controls.

![Create Application with API Key Settings](./assets/img/create-application.webp)
*Figure 3.1: Application with API Key Settings*

>*You can also view the example below for more details.*

<details>
 <summary><mark>Click to view example video:Create and Manage Application</mark></summary>

 <video controls src="https://private-user-images.githubusercontent.com/20714618/423244530-a8a2f0a9-f4c0-43b9-a604-29167c439386.mp4?jwt=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJnaXRodWIuY29tIiwiYXVkIjoicmF3LmdpdGh1YnVzZXJjb250ZW50LmNvbSIsImtleSI6ImtleTUiLCJleHAiOjE3NDIyMDA5MDcsIm5iZiI6MTc0MjIwMDYwNywicGF0aCI6Ii8yMDcxNDYxOC80MjMyNDQ1MzAtYThhMmYwYTktZjRjMC00M2I5LWE2MDQtMjkxNjdjNDM5Mzg2Lm1wND9YLUFtei1BbGdvcml0aG09QVdTNC1ITUFDLVNIQTI1NiZYLUFtei1DcmVkZW50aWFsPUFLSUFWQ09EWUxTQTUzUFFLNFpBJTJGMjAyNTAzMTclMkZ1cy1lYXN0LTElMkZzMyUyRmF3czRfcmVxdWVzdCZYLUFtei1EYXRlPTIwMjUwMzE3VDA4MzY0N1omWC1BbXotRXhwaXJlcz0zMDAmWC1BbXotU2lnbmF0dXJlPTc1OGVhOTJkYjc0YWFhZmRkNzFiMzAxMmRlMDg3ZjhjNzQ2YTk0MjA2ZGVmMjI2NWI3YjFmNjM3ZWZjZDU1ODYmWC1BbXotU2lnbmVkSGVhZGVycz1ob3N0In0.L48lR7l7F4-o0BMlEb5DHp72X0kcu1-cwGCJf0U5mAY" title="Create and Manage API Keys"></video>
 </details>

## 👨‍💻 For Developers

### 1.One-Line Code Integration

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

### 2.API Documentation

NexusGate provides comprehensive OpenAPI documentation for easy integration with your existing systems and workflows. You can access the OpenAPI specification at:

```
https://your-nexusgate-server/swagger
```

The documentation includes all available endpoints, request/response formats, and authentication requirements, enabling developers to quickly understand and utilize all of NexusGate's capabilities.

## 👨‍💼 For Administrators

### 1.Centralized LLM Management

NexusGate provides a unified dashboard for managing all LLM applications in your organization:

- **Cost Control**: Track token usage across all applications and providers
- **Security Oversight**: Monitor all prompts and completions to ensure compliance and data protection
- **Performance Optimization**: Identify bottlenecks and optimize response times
- **Usage Analytics**: Understand how different teams and applications are utilizing LLM resources

### 2.Application Management

Control and configure platform-integrated applications,offering flexible expiration settings for enhanced security, rate limits and usage limits for cost control, and granular permissions for different models and features.

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
