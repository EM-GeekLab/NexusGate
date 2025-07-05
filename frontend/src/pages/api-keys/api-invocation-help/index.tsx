import { useTranslation } from 'react-i18next'

import { getAPIBaseURL } from '@/lib/utils'
import { Markdown } from '@/components/app/markdown'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

const methods = {
  sh: {
    name: 'curl',
    code: ({ baseURL, apiKeyEnvVarName, model }) => String.raw`curl "${baseURL}/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $${apiKeyEnvVarName}"  \
  -d '{
    "model": "${model}",
    "messages": [
      {
        "role": "user",
        "content": "Hello!"
      }
    ]
  }'`,
  },
  python: {
    name: 'Python',
    code: ({ baseURL, apiKeyEnvVarName, model }) => `import os
from openai import OpenAI

client = OpenAI(
    base_url="${baseURL}",
    api_key=os.environ.get("${apiKeyEnvVarName}")
)

completion = client.chat.completions.create(
    model="${model}",
    messages=[
        {
            "role": "user",
            "content": "Hello!",
        },
    ],
)

print(completion.choices[0].message.content)`,
  },
  typescript: {
    name: 'TypeScript',
    code: ({ baseURL, apiKeyEnvVarName, model }) => `import OpenAI from "openai"

const openai = new OpenAI({
  base_url: '${baseURL}',
  api_key: process.env['${apiKeyEnvVarName}']
})

const completion = await client.chat.completions.create({
  model: '${model}',
  messages: [
    {
      role: 'user',
      content: 'Hello!'
    },
  ],
})

console.log(completion.choices[0].message.content)`,
  },
} satisfies Record<
  string,
  {
    name: string
    code: (ctx: { baseURL: string; apiKeyEnvVarName: string; model: string }) => string
  }
>

const apiKeyEnvVarName = 'NEXUSGATE_API_KEY'

function APIUsageHelp({ apiKey }: { apiKey?: string }) {
  const { t } = useTranslation()
  return (
    <Tabs className="min-w-0">
      <TabsList>
        {Object.entries(methods).map(([lang, { name }]) => (
          <TabsTrigger key={lang} value={lang}>
            {name}
          </TabsTrigger>
        ))}
      </TabsList>
      {Object.entries(methods).map(([lang, { code }]) => (
        <TabsContent key={lang} value={lang}>
          <Markdown
            text={`1. ${t('pages.api-keys.invocation-guide.SetAPIKeyEnvVar')}

\`\`\`sh
export ${apiKeyEnvVarName}="${apiKey ?? 'YOUR_KEY'}"
\`\`\`

2. ${t('pages.api-keys.invocation-guide.ReferToCodeForInvocation')}

\`\`\`${lang}
${code({ apiKeyEnvVarName, baseURL: getAPIBaseURL(), model: 'YOUR_MODEL' })}
\`\`\`
`}
          />
        </TabsContent>
      ))}
    </Tabs>
  )
}

export function ApiKeyInvocationGuideButton({
  apiKey,
  children,
  asChild,
}: {
  apiKey?: string
  children?: React.ReactNode
  asChild?: boolean
}) {
  const { t } = useTranslation()
  return (
    <Dialog>
      <DialogTrigger asChild={asChild}>
        {children ?? t('pages.api-keys.invocation-guide.APIInvocationGuide')}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('pages.api-keys.invocation-guide.APIInvocationGuide')}</DialogTitle>
        </DialogHeader>
        <APIUsageHelp apiKey={apiKey} />
      </DialogContent>
    </Dialog>
  )
}
