---
name: SecureSnapshot
description: "Creates a full git backup (commit + tag + push) with a timestamp. Trigger this skill automatically when the user mentions \"grande atualização\", \"grande mudança\", \"backup\", \"snapshot\", \"ponto de restauração\", or \"save point\"."
---

1. Immediate Action: Stop any code generation. Focus on the terminal execution.
2. Generate Timestamp: Create a variable with the current time (Format: YYYY-MM-DD_HHmm).
3. Execute Git Commands Sequence (one by one):
   - Run `git add .` to stage all current changes.
   - Run `git commit -m "🛡️ SNAPSHOT: Pre-Update Backup [${TIMESTAMP}]"` (If nothing to commit, proceed to tagging anyway).
   - Run `git tag -a "restore-point-${TIMESTAMP}" -m "Auto-generated before major update"`
   - Run `git push origin HEAD --tags` (This pushes the current branch and the new tag to GitHub).
4. Validation:
   - Check the command output. If there is an error (e.g., auth failed), stop and alert the user with 🔴.
5. Success Output:
   - Reply in PT-BR: "✅ **Ponto de Restauração Criado:** `restore-point-${TIMESTAMP}`"
   - Reply in PT-BR: "🚀 **Backup no GitHub:** Sincronizado com sucesso."
   - Reply in PT-BR: "Pode iniciar a grande atualização agora com segurança."