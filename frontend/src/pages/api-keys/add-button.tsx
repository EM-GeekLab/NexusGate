import { useState, type ComponentProps } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { addDays, format } from 'date-fns'
import { CalendarIcon, PlusIcon } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { api } from '@/lib/api'
import { newApiError } from '@/lib/error'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { useCopy } from '@/hooks/use-copy'

import { useTranslation } from 'react-i18next'

const addKeySchema = z.object({
  comment: z.string().min(1, { message: 'Comment is required' }),
  expiresAt: z.date().optional(),
})

type AddKeySchema = z.infer<typeof addKeySchema>

export function AddButton({ ...props }: ComponentProps<typeof Button>) {
  const { t } = useTranslation()
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button {...props}>
          <PlusIcon />
          {t('New.application')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <AddDialogContent />
      </DialogContent>
    </Dialog>
  )
}

function AddDialogContent() {
  const [createdKey, setCreatedKey] = useState<string>('')
  const { t } = useTranslation()
  return !createdKey ? (
    <>
      <DialogHeader>
        <DialogTitle>{t('Create.a.new.application')}</DialogTitle>
        <DialogDescription>{t('Create.a.new.application.for.LLM.calls.')}</DialogDescription>
      </DialogHeader>
      <AddKeyForm onSubmitSuccessful={(key) => setCreatedKey(key)} />
    </>
  ) : (
    <>
      <DialogHeader>
        <DialogTitle>{t('Application.created')}</DialogTitle>
        <DialogDescription>
        {t('Your.new.application.with.the.API.key.has.been.created..Please.copy.the.API.key.below.and.store.it.in.a.safe.place.')}
        </DialogDescription>
        <KeyCreatedContent apiKey={createdKey} />
      </DialogHeader>
    </>
  )
}

function AddKeyForm({ onSubmitSuccessful }: { onSubmitSuccessful: (key: string) => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { mutate, isPending, isError, error } = useMutation({
    mutationFn: async (values: AddKeySchema) => {
      const { data, error } = await api.admin.apiKey.post(values)
      if (error) throw newApiError(error)
      return data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['apiKeys'] })
      onSubmitSuccessful(data.key)
    },
  })

  const form = useForm<AddKeySchema>({
    resolver: zodResolver(addKeySchema),
    defaultValues: { comment: '' },
  })

  return (
    <Form {...form}>
      <form className="grid gap-4" onSubmit={form.handleSubmit((v) => mutate(v))}>
        <FormField
          control={form.control}
          name="comment"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Name')}</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormDescription>{t('Enter.a.name.for.this.application.')}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="expiresAt"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Expiration')}</FormLabel>
              <FormControl>
                <ExpireDatePicker value={field.value} onValueChange={field.onChange} />
              </FormControl>
              <FormDescription>
                {t('Choose.an.expiration.date.for.the.API.key.of.this.application,.or.select.no.expiration.date.')}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        {isError && <p className="text-destructive">{error.message}</p>}
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              {t('Cancel')}
            </Button>
          </DialogClose>
          <Button type="submit">
            {isPending && <Spinner />}
            {t('Save')}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  )
}

function ExpireDatePicker({ value, onValueChange }: { value?: Date; onValueChange: (value?: Date) => void }) {
  type SelectValue = '7' | '30' | '90' | '180' | '365' | 'custom' | 'no'
  const [selectValue, setSelectValue] = useState<SelectValue>('no')

  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Select
        value={selectValue}
        onValueChange={(v: SelectValue) => {
          setSelectValue(v)
          switch (v) {
            case 'no':
              return onValueChange(undefined)
            case 'custom':
              return onValueChange(addDays(new Date().setHours(0, 0, 0, 0), 1))
            default:
              return onValueChange(addDays(new Date().setHours(0, 0, 0, 0), parseInt(v)))
          }
        }}
      >
        <SelectTrigger className="w-full sm:basis-[180px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="7">{t('7.days')}</SelectItem>
          <SelectItem value="30">{t('30.days')}</SelectItem>
          <SelectItem value="90">{t('90.days')}</SelectItem>
          <SelectItem value="180">{t('180.days')}</SelectItem>
          <SelectItem value="365">{t('365.days')}</SelectItem>
          <SelectItem value="custom">{t('Custom')}</SelectItem>
          <SelectItem value="no">{t('No.expiration')}</SelectItem>
        </SelectContent>
      </Select>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            disabled={selectValue !== 'custom'}
            className={cn(
              'justify-start text-left font-normal disabled:opacity-100 sm:flex-1',
              !value && 'text-muted-foreground',
            )}
          >
            <CalendarIcon />
            {value ? format(value, 'yyyy-MM-dd') : <span>{t('No.expiration.date')}</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0">
          <Calendar
            mode="single"
            selected={value}
            onSelect={onValueChange}
            disabled={(date) => date < new Date()}
            initialFocus
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}

function KeyCreatedContent({ apiKey }: { apiKey: string }) {
  const { t } = useTranslation()

  const { copy, copied } = useCopy({ showSuccessToast: true, successToastMessage: t('API.key.copied.to.clipboard.' )})
 
  return (
    <div className="grid gap-4">
      <Input value={apiKey} readOnly />
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            {t('Close')}
          </Button>
        </DialogClose>
        <Button type="button" onClick={() => copy(apiKey)}>
          {copied ? t('Copied!') : t('Copy')}
        </Button>
      </DialogFooter>
    </div>
  )
}
