# WheelForge v1.0.2

Correções de confiabilidade para a ponte nativa Windows, comandos de emergência e saída HID.

## Alterações

- Escritas seriais nativas aguardam a conclusão de `write_all` e propagam falhas de COM ao chamador.
- Reconexão serial encerra e aguarda o worker anterior; a limpeza de uma sessão antiga não apaga o estado da sessão atual.
- O E-Stop tenta todas as ações, confirma `axis0.current_state == 1`, para os slots PID e desativa os atuadores antes de desconectar o HID. Falhas são retornadas à interface.
- Desconexões HID nativas atualizam o estado da interface; escritas HID incompletas ou com erro não são tratadas como sucesso.
- Sequências de relatórios de cada alteração de efeito HID são serializadas para impedir intercalações em sliders rápidos.
- Relatórios de telemetria HID são enviados em lotes de até 4 ms. O teste determinístico de 1 kHz preserva os 1.000 relatórios e reduz eventos Tauri simulados de 1.000 para 250 por segundo (75%). O atraso real deve ser confirmado com o dispositivo conectado.

## Validação

- `bun test src`: 60 testes aprovados.
- `cargo test --offline --lib`: 14 testes aprovados.
- `bun run build`, typecheck, `i18n:check` e `firmware:check` concluídos.
- Build do instalador Windows x64 executado pelo Tauri.
