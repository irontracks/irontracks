#!/usr/bin/env ruby
# frozen_string_literal: true
#
# add-watch-complications-target.rb
#
# Cria o target da extensão de Complications do Apple Watch (WidgetKit, watchOS 9+)
# e o embarca dentro do Watch App. Idempotente: rodar de novo não duplica nada.
#
# Também registra no target do Watch App os arquivos novos que ele passou a usar
# (WatchSharedStore.swift, RestTimerEngine.swift) — sem isso o app compila sem eles
# e as complications nunca recebem dados.
#
#   ruby scripts/add-watch-complications-target.rb
#
require 'xcodeproj'

PROJECT_PATH   = File.expand_path('../ios/App/App.xcodeproj', __dir__)
IOS_APP_DIR    = File.expand_path('../ios/App', __dir__)
TARGET_NAME    = 'IronTracksWatchComplications'
WATCH_TARGET   = 'IronTracksWatch Watch App'
EXT_FOLDER     = 'IronTracksWatchComplications'
BUNDLE_ID      = 'com.irontracks.app.watchkitapp.complications'
TEAM_ID        = '5XLC55D3YR'
DEPLOYMENT     = '9.0'

# Arquivos do Watch App que também precisam compilar DENTRO da extensão
# (processos separados — cada target precisa da sua própria cópia do código).
SHARED_SOURCES = [
  'IronTracksWatch Watch App/Models/SharedModels.swift',
  'IronTracksWatch Watch App/Models/WatchSharedStore.swift'
].freeze

# Arquivos novos que o Watch App passou a usar.
NEW_WATCH_SOURCES = [
  'IronTracksWatch Watch App/Models/WatchSharedStore.swift',
  'IronTracksWatch Watch App/Models/WorkoutInputFormat.swift',
  'IronTracksWatch Watch App/Services/RestTimerEngine.swift'
].freeze

project = Xcodeproj::Project.open(PROJECT_PATH)

watch_target = project.targets.find { |t| t.name == WATCH_TARGET }
abort("✖ Target '#{WATCH_TARGET}' não encontrado.") unless watch_target

# ─── Helper: acha ou cria um file reference por path relativo a ios/App ────
def file_ref_for(project, rel_path)
  existing = project.files.find { |f| f.real_path.to_s == File.join(IOS_APP_DIR, rel_path) }
  return existing if existing

  group_path = File.dirname(rel_path)
  group = project.main_group
  group_path.split('/').each do |segment|
    next if segment == '.'
    found = group.children.find { |c| c.display_name == segment && c.is_a?(Xcodeproj::Project::Object::PBXGroup) }
    group = found || group.new_group(segment, segment)
  end
  group.new_reference(File.basename(rel_path))
end

def sources_phase(target)
  target.build_phases.find { |p| p.is_a?(Xcodeproj::Project::Object::PBXSourcesBuildPhase) }
end

def already_compiled?(phase, ref)
  phase.files_references.include?(ref)
end

# ─── 1. Registrar os arquivos novos no target do Watch App ────────────────
puts "→ Registrando fontes novas no target '#{WATCH_TARGET}'..."
watch_sources = sources_phase(watch_target)
NEW_WATCH_SOURCES.each do |rel|
  ref = file_ref_for(project, rel)
  if already_compiled?(watch_sources, ref)
    puts "  = já presente: #{File.basename(rel)}"
  else
    watch_sources.add_file_reference(ref)
    puts "  + #{File.basename(rel)}"
  end
end

# ─── 2. Criar (ou reusar) o target da extensão ────────────────────────────
ext_target = project.targets.find { |t| t.name == TARGET_NAME }

if ext_target
  puts "→ Target '#{TARGET_NAME}' já existe — atualizando."
else
  puts "→ Criando target '#{TARGET_NAME}' (app-extension watchOS)..."
  ext_target = project.new(Xcodeproj::Project::Object::PBXNativeTarget)
  ext_target.name = TARGET_NAME
  ext_target.product_name = TARGET_NAME
  ext_target.product_type = 'com.apple.product-type.app-extension'
  ext_target.build_configuration_list =
    Xcodeproj::Project::ProjectHelper.configuration_list(project, :watchos, DEPLOYMENT, nil, :swift)
  project.targets << ext_target

  product_ref = project.products_group.new_reference("#{TARGET_NAME}.appex", :built_products)
  product_ref.include_in_index = '0'
  product_ref.explicit_file_type = 'wrapper.app-extension'
  ext_target.product_reference = product_ref

  ext_target.build_phases << project.new(Xcodeproj::Project::Object::PBXSourcesBuildPhase)
  ext_target.build_phases << project.new(Xcodeproj::Project::Object::PBXFrameworksBuildPhase)
  ext_target.build_phases << project.new(Xcodeproj::Project::Object::PBXResourcesBuildPhase)
end

# ─── 3. Fontes da extensão ────────────────────────────────────────────────
puts '→ Adicionando fontes da extensão...'
ext_sources = sources_phase(ext_target)

ext_swift = Dir.glob(File.join(IOS_APP_DIR, EXT_FOLDER, '*.swift'))
              .map { |p| p.sub("#{IOS_APP_DIR}/", '') }
              .sort
(ext_swift + SHARED_SOURCES).each do |rel|
  ref = file_ref_for(project, rel)
  if already_compiled?(ext_sources, ref)
    puts "  = já presente: #{File.basename(rel)}"
  else
    ext_sources.add_file_reference(ref)
    puts "  + #{File.basename(rel)}"
  end
end

# Info.plist e entitlements só precisam de referência no projeto (não compilam).
file_ref_for(project, "#{EXT_FOLDER}/Info.plist")
file_ref_for(project, "#{EXT_FOLDER}/#{TARGET_NAME}.entitlements")

# ─── 4. Build settings ────────────────────────────────────────────────────
puts '→ Aplicando build settings...'

# A versão da extensão TEM que acompanhar a do app. Os Info.plist usam
# $(MARKETING_VERSION)/$(CURRENT_PROJECT_VERSION); se o target não definir essas
# variáveis, o plist expande vazio e o build/upload quebra. Copiamos do target App
# pra que o bump do ios:release continue valendo pra todo mundo.
app_target = project.targets.find { |t| t.name == 'App' }
app_release = app_target&.build_configurations&.find { |c| c.name == 'Release' }
marketing_version = app_release&.build_settings&.dig('MARKETING_VERSION') || '1.0'
build_version = app_release&.build_settings&.dig('CURRENT_PROJECT_VERSION') || '1'

ext_target.build_configurations.each do |config|
  bs = config.build_settings
  bs['MARKETING_VERSION'] = marketing_version
  bs['CURRENT_PROJECT_VERSION'] = build_version
  bs['SDKROOT'] = 'watchos'
  bs['WATCHOS_DEPLOYMENT_TARGET'] = DEPLOYMENT
  bs['TARGETED_DEVICE_FAMILY'] = '4'
  bs['SWIFT_VERSION'] = '5.0'
  bs['PRODUCT_NAME'] = '$(TARGET_NAME)'
  bs['PRODUCT_BUNDLE_IDENTIFIER'] = BUNDLE_ID
  bs['INFOPLIST_FILE'] = "#{EXT_FOLDER}/Info.plist"
  bs['GENERATE_INFOPLIST_FILE'] = 'NO'
  bs['CODE_SIGN_ENTITLEMENTS'] = "#{EXT_FOLDER}/#{TARGET_NAME}.entitlements"
  bs['CODE_SIGN_STYLE'] = 'Automatic'
  bs['DEVELOPMENT_TEAM'] = TEAM_ID
  # Extensão NÃO pode usar API proibida a extensions — o compilador cobra isso.
  bs['APPLICATION_EXTENSION_API_ONLY'] = 'YES'
  bs['ALWAYS_EMBED_SWIFT_STANDARD_LIBRARIES'] = 'NO'
  bs['SKIP_INSTALL'] = 'YES'
  bs['LD_RUNPATH_SEARCH_PATHS'] = ['$(inherited)', '@executable_path/Frameworks', '@executable_path/../../Frameworks']
end

# ─── 5. Embutir a extensão DENTRO do Watch App ────────────────────────────
# Extensão de watchOS mora no Watch App (PlugIns), não no app iOS.
puts "→ Embutindo '#{TARGET_NAME}' no '#{WATCH_TARGET}'..."

unless watch_target.dependencies.any? { |d| d.target == ext_target }
  watch_target.add_dependency(ext_target)
  puts '  + dependência adicionada'
end

phase_name = 'Embed Foundation Extensions'
embed_phase = watch_target.copy_files_build_phases.find { |p| p.name == phase_name }
unless embed_phase
  embed_phase = watch_target.new_copy_files_build_phase(phase_name)
  embed_phase.symbol_dst_subfolder_spec = :plug_ins
  puts '  + fase de cópia criada'
end

if embed_phase.files_references.include?(ext_target.product_reference)
  puts '  = extensão já embutida'
else
  build_file = embed_phase.add_file_reference(ext_target.product_reference)
  build_file.settings = { 'ATTRIBUTES' => ['RemoveHeadersOnCopy'] }
  puts '  + extensão embutida'
end

project.save
puts "\n✓ Pronto. Target '#{TARGET_NAME}' configurado e embutido no Watch App."
