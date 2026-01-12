import { createContext, useContext } from 'react'
import { RotateCcwIcon, XIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsContent } from '@/components/ui/tabs'

import type { ChatRequest } from '../columns'
import { useRequestDetail } from '../request-detail-provider'
import { DetailPanelCloseButton, DetailPanelHeader } from './header'
import { MessagesPrettyView } from './pretty-view'
import { MessagesRawView } from './raw-view'

const DetailContext = createContext<ChatRequest | null>(null)
export const useRequestDetailContext = () => {
  const ctx = useContext(DetailContext)
  if (!ctx) throw new Error('useDetailContext must be used within DetailContext.Provider')
  return ctx
}

export function DetailPanel() {
  const { t } = useTranslation()

  const {
    isSelectedRequest,
    selectedRequest: data,
    setSelectedRequestId,
    isPending,
    error,
    refetch,
  } = useRequestDetail()

  if (!isSelectedRequest) return null

  return (
    <div className="bg-background 3xl:basis-3/5 @container h-full w-full min-w-0 lg:basis-[520px] lg:border-l xl:basis-[620px] 2xl:basis-1/2">
      {!data ? (
        <div className="flex h-full flex-col">
          <header className="flex items-center justify-between p-4 @2xl:border-b">
            <DetailPanelCloseButton className="-m-1.5 mr-0" />
          </header>
          <div className="flex flex-1 flex-col items-center justify-center">
            {isPending && <Spinner className="text-muted-foreground" />}
            {error && (
              <>
                <div className="text-sm">{error?.message}</div>
                <div className="mt-4 flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setSelectedRequestId(undefined)}>
                    <XIcon />
                    {t('pages.requests.detail-panel.index.Close')}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => refetch()}>
                    <RotateCcwIcon />
                    {t('pages.requests.detail-panel.index.Retry')}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        <DetailContext.Provider value={data}>
          <Tabs className="h-full gap-0" defaultValue="pretty">
            <DetailPanelHeader />
            <TabsContent value="pretty" className="flex flex-col overflow-hidden">
              <MessagesPrettyView />
            </TabsContent>
            <TabsContent value="raw" className="overflow-auto py-4">
              <MessagesRawView />
            </TabsContent>
          </Tabs>
        </DetailContext.Provider>
      )}
    </div>
  )
}
