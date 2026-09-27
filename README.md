# Willow

Willow é um aplicativo para Windows que reúne uma ilha dinâmica, um dock personalizável, controles do sistema e monitoramento de limites de assistentes de IA.

<p align="center">
  <img src="src/assets/willow-logo.png" alt="Logo do Willow" width="96">
</p>

## Recursos

• Ilha superior com relógio, calendário, temporizador e controles de mídia

• Controles de volume e brilho na esfera esquerda e aplicativos na esfera direita

• Painel de uso de IA com atualização manual e automática a cada cinco minutos

• Leitura de limites disponíveis para Codex, Claude, Cursor, Grok e OpenCode

• Detecção local de Antigravity e GLM

• Dock para substituir a barra de tarefas do Windows

• Prévia de janelas, aplicativos fixados e atalhos Win mais número

• Clima, bateria, CPU, memória, disco e rede

• Tema escuro, claro, personalizado e adaptável

• Cor unificada entre a ilha, o dock, o monitor de IA e os indicadores

• Interface em português

## Privacidade

Willow lê somente os arquivos locais de sessão necessários para consultar os limites das contas já conectadas. Tokens não são enviados para a interface, não aparecem em logs e não são gravados novamente. Cada credencial é usada apenas com o serviço que a criou.

## Requisitos

• Windows 10 ou Windows 11

• WebView2

• Bun 1.4 ou mais recente

• Rust estável com o alvo MSVC

• Visual Studio Build Tools com Desenvolvimento para desktop com C++

## Desenvolvimento

Instale as dependências:

```powershell
bun install
```

Abra o aplicativo em modo de desenvolvimento:

```powershell
bun run tauri dev
```

Valide a interface:

```powershell
bun run build
```

Valide o código nativo:

```powershell
cd src-tauri
cargo check --locked
cargo test --locked
```

## Organização

```text
src/
  components/       componentes da ilha e do dock
  hooks/            sincronização de configurações e clima
  icons/            ícones usados pela interface
  settings/         páginas e estado das configurações
  types/            contratos compartilhados do frontend
src-tauri/
  src/ai_usage.rs   leitura segura dos limites de IA
  src/commands.rs   comandos enviados pela interface
  src/services.rs   integrações de longa duração com o Windows
  src/utils.rs      armazenamento e utilitários
  icons/            ícones do executável e do instalador
public/             ativos públicos
scripts/            automação de versão e lançamento
```

## Limites de IA

As integrações usam sessões já existentes no computador. Willow não realiza login em nome do usuário.

• Codex consulta o limite atual e usa a sessão local mais recente como alternativa

• Claude consulta os limites das contas encontradas em pastas de perfil locais

• Cursor usa a sessão do editor em modo somente leitura

• Grok usa a sessão criada pelo comando de login do próprio cliente

• OpenCode consulta o plano Go quando a sessão compatível está disponível

• Antigravity e GLM são detectados localmente e aparecem quando instalados

## Atualizações

O mecanismo de atualização automática fica desativado até que um repositório de lançamentos e uma chave de assinatura próprios sejam configurados. Consulte `src-tauri/tauri.conf.json` antes de publicar instaladores.

## Licença

Willow é distribuído sob a GNU General Public License, versão 3. Consulte [LICENSE](LICENSE) e [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
