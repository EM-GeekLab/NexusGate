{{/*
Expand the name of the chart.
*/}}
{{- define "nexusgate.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "nexusgate.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "nexusgate.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "nexusgate.labels" -}}
helm.sh/chart: {{ include "nexusgate.chart" . }}
{{ include "nexusgate.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "nexusgate.selectorLabels" -}}
app.kubernetes.io/name: {{ include "nexusgate.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "nexusgate.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "nexusgate.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Return the proper image name
*/}}
{{- define "nexusgate.image" -}}
{{- $tag := .Values.image.tag | default .Chart.AppVersion }}
{{- printf "%s:%s" .Values.image.repository $tag }}
{{- end }}

{{/*
Return the PostgreSQL hostname
*/}}
{{- define "nexusgate.postgresql.host" -}}
{{- if .Values.nexusgate.database.external }}
{{- .Values.nexusgate.database.host }}
{{- else }}
{{- printf "%s-postgresql" (include "nexusgate.fullname" .) }}
{{- end }}
{{- end }}

{{/*
Return the PostgreSQL port
*/}}
{{- define "nexusgate.postgresql.port" -}}
{{- if .Values.nexusgate.database.external }}
{{- .Values.nexusgate.database.port | default 5432 }}
{{- else }}
{{- 5432 }}
{{- end }}
{{- end }}

{{/*
Return the PostgreSQL database name
*/}}
{{- define "nexusgate.postgresql.database" -}}
{{- if .Values.nexusgate.database.external }}
{{- .Values.nexusgate.database.name | default "nexusgate" }}
{{- else }}
{{- .Values.postgresql.auth.database | default "nexusgate" }}
{{- end }}
{{- end }}

{{/*
Return the PostgreSQL username
*/}}
{{- define "nexusgate.postgresql.username" -}}
{{- if .Values.nexusgate.database.external }}
{{- .Values.nexusgate.database.user | default "nexusgate" }}
{{- else }}
{{- .Values.postgresql.auth.username | default "nexusgate" }}
{{- end }}
{{- end }}

{{/*
Return the PostgreSQL secret name
*/}}
{{- define "nexusgate.postgresql.secretName" -}}
{{- if .Values.nexusgate.database.external }}
{{- if .Values.nexusgate.database.existingSecret }}
{{- .Values.nexusgate.database.existingSecret }}
{{- else }}
{{- printf "%s-db-external" (include "nexusgate.fullname" .) }}
{{- end }}
{{- else }}
{{- if .Values.postgresql.auth.existingSecret }}
{{- .Values.postgresql.auth.existingSecret }}
{{- else }}
{{- printf "%s-postgresql" (include "nexusgate.fullname" .) }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Return the PostgreSQL password key
*/}}
{{- define "nexusgate.postgresql.passwordKey" -}}
{{- if .Values.nexusgate.database.external }}
{{- .Values.nexusgate.database.existingSecretPasswordKey | default "password" }}
{{- else }}
{{- "password" }}
{{- end }}
{{- end }}

{{/*
Return the Redis hostname
*/}}
{{- define "nexusgate.redis.host" -}}
{{- if .Values.nexusgate.redis.external }}
{{- .Values.nexusgate.redis.host }}
{{- else }}
{{- printf "%s-redis-master" (include "nexusgate.fullname" .) }}
{{- end }}
{{- end }}

{{/*
Return the Redis port
*/}}
{{- define "nexusgate.redis.port" -}}
{{- if .Values.nexusgate.redis.external }}
{{- .Values.nexusgate.redis.port | default 6379 }}
{{- else }}
{{- 6379 }}
{{- end }}
{{- end }}

{{/*
Return the Redis secret name
*/}}
{{- define "nexusgate.redis.secretName" -}}
{{- if .Values.nexusgate.redis.external }}
{{- if .Values.nexusgate.redis.existingSecret }}
{{- .Values.nexusgate.redis.existingSecret }}
{{- else }}
{{- printf "%s-redis-external" (include "nexusgate.fullname" .) }}
{{- end }}
{{- else }}
{{- if .Values.redis.auth.existingSecret }}
{{- .Values.redis.auth.existingSecret }}
{{- else }}
{{- printf "%s-redis" (include "nexusgate.fullname" .) }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Return the Redis password key
*/}}
{{- define "nexusgate.redis.passwordKey" -}}
{{- if .Values.nexusgate.redis.external }}
{{- .Values.nexusgate.redis.existingSecretPasswordKey | default "password" }}
{{- else }}
{{- "redis-password" }}
{{- end }}
{{- end }}

{{/*
Return the admin key secret name
*/}}
{{- define "nexusgate.adminKeySecretName" -}}
{{- if .Values.nexusgate.existingSecret }}
{{- .Values.nexusgate.existingSecret }}
{{- else }}
{{- printf "%s-admin" (include "nexusgate.fullname" .) }}
{{- end }}
{{- end }}

{{/*
Operator labels
*/}}
{{- define "nexusgate.operator.labels" -}}
helm.sh/chart: {{ include "nexusgate.chart" . }}
{{ include "nexusgate.operator.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Operator selector labels
*/}}
{{- define "nexusgate.operator.selectorLabels" -}}
app.kubernetes.io/name: {{ include "nexusgate.name" . }}-operator
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: operator
{{- end }}

{{/*
Create the name of the operator service account to use
*/}}
{{- define "nexusgate.operator.serviceAccountName" -}}
{{- if .Values.operator.serviceAccount.create }}
{{- default (printf "%s-operator" (include "nexusgate.fullname" .)) .Values.operator.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.operator.serviceAccount.name }}
{{- end }}
{{- end }}
