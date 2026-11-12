# WheelForge v1.0.1

Correções e melhorias para comunicação com firmware e bancada FFB.

## Alterações

- Corrige a preservação de linhas recebidas pela serial e associa corretamente respostas a comandos, inclusive quando os identificadores numéricos voltam a zero.
- Preserva erros de escrita entre os transportes serial disponíveis.
- Atualiza o estado da conexão HID ao detectar desconexão nativa.
- Expõe o ganho dos efeitos HID no Laboratório FFB para testes de bancada.
- Adiciona testes para enquadramento serial da PWA e respostas de erro encapsuladas do firmware.

## Validação

- `bun test src`: 53 testes aprovados.
- `bun run build`: build de produção web/PWA concluído.
- `cargo check --offline`: verificação Rust/Tauri concluída.
- `bun run tauri:build -- --bundles nsis`: executável portátil e instalador Windows x64 gerados.

## Arquivos Windows

- `WheelForge.exe`: executável portátil x64.
- `WheelForge-v1.0.1-windows-x64.zip`: pacote portátil x64.
- `WheelForge_1.0.1_x64-setup.exe`: instalador NSIS x64.
