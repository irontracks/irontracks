import { createClient } from '@supabase/supabase-js'

async function main() {
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: base } = await s
    .from('whatsapp_conversations')
    .select('context')
    .eq('phone', '5541998949082')
    .single()
  const baseTurns = Array.isArray(base?.context) ? base.context.length : 0
  console.log(`⏳ Aguardando resposta no WhatsApp (baseline: ${baseTurns} turns)...`)

  for (let i = 0; i < 36; i++) {
    const { data } = await s
      .from('whatsapp_conversations')
      .select('last_user_message, last_bot_message, context')
      .eq('phone', '5541998949082')
      .single()
    const turns = Array.isArray(data?.context) ? data.context.length : 0
    if (turns > baseTurns) {
      console.log(`\n✅ Nova troca! (${baseTurns} → ${turns} turns)`)
      console.log(`👤 MK disse: "${data?.last_user_message}"`)
      console.log(`🤖 Iron respondeu: "${data?.last_bot_message}"`)
      return
    }
    process.stdout.write('.')
    await new Promise(r => setTimeout(r, 5000))
  }
  console.log('\n⏳ Nenhuma resposta em 3min')
}
main().catch(console.error)
