# iOS Critical Alerts — pedido de entitlement + plano de implementação

Objetivo: fazer o push do professor (aluno iniciou o treino / controle aceito) **acordar
a tela e tocar mesmo no silencioso/Foco**. Isso só é possível com **Critical Alerts**, que
exige um entitlement especial liberado pela Apple sob pedido.

> ⚠️ **Não aplicar o código antes da aprovação.** Adicionar o entitlement
> `com.apple.developer.usernotifications.critical-alerts` sem a Apple ter provisionado a
> capability no App ID **quebra a assinatura** da próxima build (`ios:release`). Só mexer
> no código depois que a Apple confirmar por email.

---

## 1. Enviar o pedido à Apple (VOCÊ faz)

Formulário oficial:
**https://developer.apple.com/contact/request/notifications-critical-alerts-entitlement/**

- Logar com a conta do time (`5XLC55D3YR`).
- App: **IronTracks** (`com.irontracks.app`).
- Colar a justificativa abaixo no campo de descrição.

### Justificativa sugerida (pt/en — cole a versão em inglês)

> IronTracks is a coaching platform where certified personal trainers supervise their
> students' **live** resistance-training sessions in real time. When a student begins a
> workout, the trainer can remotely take over the session to adjust load, correct form, or
> **stop an unsafe set** while the student is mid-exercise (e.g., heavy squats, deadlifts,
> leg press).
>
> This supervision is time-critical for the trainee's physical safety: a notification that
> is silenced by Focus, the Scheduled Summary, or the ringer switch can arrive minutes late,
> after the risky set is already underway. We request the Critical Alerts entitlement so the
> trainer is alerted immediately — only for two narrowly-scoped, low-frequency events:
> (1) a supervised student started a live workout, and (2) the student accepted the trainer's
> request to take control. These are not marketing or engagement notifications; volume is at
> most a handful per session and only to the assigned trainer.

---

## 2. Pós-aprovação — implementação (EU faço, quando você confirmar o email da Apple)

Quando a Apple provisionar a capability no App ID, aplico:

### a) Entitlement (`ios/App/App/App.entitlements`)
```xml
<key>com.apple.developer.usernotifications.critical-alerts</key>
<true/>
```

### b) Pedir a autorização de critical no request de permissão (Swift)
No fluxo que chama `requestAuthorization`, incluir a opção `.criticalAlert`:
```swift
center.requestAuthorization(options: [.alert, .sound, .badge, .criticalAlert]) { ... }
```
(hoje o pedido não inclui `.criticalAlert` — sem ela o iOS ignora o nível critical.)

### c) Payload APNs (`src/lib/push/helpers/apnsPayload.ts`)
Para os tipos do professor, trocar o nível e usar som critical. Ex.: gate por um
conjunto `CRITICAL_TYPES = ['student_workout_start', 'teacher_control_accepted', 'teacher_control_request']`:
```jsonc
"aps": {
  "alert": { "title": ..., "body": ... },
  "interruption-level": "critical",
  "sound": { "critical": 1, "name": "default", "volume": 1.0 }
}
```
(hoje esses tipos usam `interruption-level: time-sensitive` + `sound: "default"`.)

### d) Testar em device (TestFlight)
Confirmar que acorda a tela + toca no silencioso. Critical toca mesmo com o botão de
silencioso ativo — validar volume/comportamento com o usuário antes de generalizar.

---

## 3. Enquanto não aprova (ou se a Apple negar)

O push já está no máximo de uma notificação normal: `interruption-level: time-sensitive`,
`apns-priority: 10`, `apns-push-type: alert`, `sound: default`, entitlement time-sensitive
presente. Sem Critical Alerts, garantir no device do professor:
- Ajustes → Notificações → IronTracks → **Notificações sensíveis ao tempo** = ON
- Sem **Foco/Concentração** filtrando o app
- **Resumo programado** desligado pro app
- **Entregar silenciosamente** desligado

Alternativa de produto (sem Apple): usar uma **Live Activity** de "controle pendente" no
Lock Screen (o app já tem infra de Live Activity) — bem visível quando a tela liga, sem
depender do entitlement.
