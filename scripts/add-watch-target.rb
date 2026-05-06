#!/usr/bin/env ruby
# frozen_string_literal: true
#
# Adiciona o target "IronTracksWatch Watch App" ao projeto iOS,
# configurado como companion do app principal (com.irontracks.app).
#
# Idempotente: se o target já existe, sai sem fazer nada.
# Faz backup automático do pbxproj antes de modificar.
#
# Uso:
#   ruby scripts/add-watch-target.rb

require 'xcodeproj'
require 'fileutils'

PROJECT_PATH = File.expand_path('../ios/App/App.xcodeproj', __dir__)
WATCH_FOLDER = 'IronTracksWatch Watch App'
WATCH_FOLDER_PATH = File.expand_path("../ios/App/#{WATCH_FOLDER}", __dir__)
TARGET_NAME = WATCH_FOLDER  # mesmo nome
WATCH_BUNDLE_ID = 'com.irontracks.app.watchkitapp'
HOST_BUNDLE_ID = 'com.irontracks.app'
TEAM_ID = '5XLC55D3YR'
MARKETING_VERSION = '1.8'
CURRENT_PROJECT_VERSION = '35'

abort "Pasta Watch não existe: #{WATCH_FOLDER_PATH}" unless Dir.exist?(WATCH_FOLDER_PATH)

project = Xcodeproj::Project.open(PROJECT_PATH)

# ─── Idempotência ──────────────────────────────────────────────────────────
existing = project.targets.find { |t| t.name == TARGET_NAME }
if existing
  puts "✓ Target '#{TARGET_NAME}' já existe (id=#{existing.uuid}). Nada a fazer."
  exit 0
end

# Backup
backup = "#{PROJECT_PATH}/project.pbxproj.before-watch-target-#{Time.now.strftime('%Y%m%d-%H%M%S')}"
FileUtils.cp("#{PROJECT_PATH}/project.pbxproj", backup)
puts "📦 Backup salvo em: #{backup}"

# ─── 1. Criar group no project navigator ──────────────────────────────────
puts "→ Criando group '#{WATCH_FOLDER}'..."
watch_group = project.main_group.new_group(WATCH_FOLDER, WATCH_FOLDER)

# Função recursiva pra adicionar arquivos preservando hierarquia.
def add_recursive(group, fs_path, project)
  results = { swift: [], assets: [], plist: nil, entitlements: nil }
  Dir.children(fs_path).sort.each do |entry|
    full = File.join(fs_path, entry)
    if File.directory?(full)
      if entry.end_with?('.xcassets')
        # Asset catalog é um item único, não um group
        ref = group.new_reference(entry)
        ref.last_known_file_type = 'folder.assetcatalog'
        results[:assets] << ref
      else
        sub = group.new_group(entry, entry)
        sub_results = add_recursive(sub, full, project)
        results[:swift].concat(sub_results[:swift])
        results[:assets].concat(sub_results[:assets])
        results[:plist] ||= sub_results[:plist]
        results[:entitlements] ||= sub_results[:entitlements]
      end
    else
      ref = group.new_reference(entry)
      case File.extname(entry)
      when '.swift'
        results[:swift] << ref
      when '.plist'
        results[:plist] = ref
      when '.entitlements'
        results[:entitlements] = ref
      end
    end
  end
  results
end

added = add_recursive(watch_group, WATCH_FOLDER_PATH, project)
puts "  Swift files: #{added[:swift].size}"
puts "  Asset catalogs: #{added[:assets].size}"
puts "  Info.plist: #{added[:plist] ? 'ok' : 'MISSING'}"
puts "  Entitlements: #{added[:entitlements] ? 'ok' : 'MISSING'}"

# ─── 2. Criar Watch App target ────────────────────────────────────────────
puts "→ Criando target '#{TARGET_NAME}' (watchOS)..."
watch_target = project.new(Xcodeproj::Project::Object::PBXNativeTarget)
watch_target.name = TARGET_NAME
watch_target.product_name = TARGET_NAME
watch_target.product_type = 'com.apple.product-type.application'
watch_target.build_configuration_list = Xcodeproj::Project::ProjectHelper.configuration_list(project, :watchos, '9.0', nil, :swift)
project.targets << watch_target

# Product reference (.app na pasta Products)
products_group = project.products_group
product_ref = products_group.new_reference("#{TARGET_NAME}.app", :built_products)
product_ref.include_in_index = '0'
product_ref.explicit_file_type = 'wrapper.application'
watch_target.product_reference = product_ref

# ─── 3. Build phases ──────────────────────────────────────────────────────
puts "→ Configurando build phases..."

# Sources (Swift files)
sources_phase = watch_target.new_shell_script_build_phase  # placeholder, vamos substituir
watch_target.build_phases.delete(sources_phase)

sources_phase = project.new(Xcodeproj::Project::Object::PBXSourcesBuildPhase)
added[:swift].each { |f| sources_phase.add_file_reference(f) }
watch_target.build_phases << sources_phase

# Frameworks (vazio — system frameworks são linkados automaticamente)
frameworks_phase = project.new(Xcodeproj::Project::Object::PBXFrameworksBuildPhase)
watch_target.build_phases << frameworks_phase

# Resources (assets)
resources_phase = project.new(Xcodeproj::Project::Object::PBXResourcesBuildPhase)
added[:assets].each { |f| resources_phase.add_file_reference(f) }
watch_target.build_phases << resources_phase

# ─── 4. Build settings ────────────────────────────────────────────────────
puts "→ Aplicando build settings..."

watch_target.build_configurations.each do |config|
  bs = config.build_settings
  bs['ALWAYS_EMBED_SWIFT_STANDARD_LIBRARIES'] = 'YES'
  bs['APPLICATION_EXTENSION_API_ONLY'] = 'NO'
  bs['ASSETCATALOG_COMPILER_APPICON_NAME'] = 'AppIcon'
  bs['ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME'] = 'AccentColor'
  bs['CLANG_ANALYZER_NONNULL'] = 'YES'
  bs['CLANG_ANALYZER_NUMBER_OBJECT_CONVERSION'] = 'YES_AGGRESSIVE'
  bs['CLANG_CXX_LANGUAGE_STANDARD'] = 'gnu++20'
  bs['CLANG_ENABLE_MODULES'] = 'YES'
  bs['CLANG_ENABLE_OBJC_ARC'] = 'YES'
  bs['CLANG_ENABLE_OBJC_WEAK'] = 'YES'
  bs['CODE_SIGN_ENTITLEMENTS'] = "#{WATCH_FOLDER}/IronTracksWatch.entitlements"
  bs['CODE_SIGN_STYLE'] = 'Automatic'
  bs['CURRENT_PROJECT_VERSION'] = CURRENT_PROJECT_VERSION
  bs['DEVELOPMENT_TEAM'] = TEAM_ID
  bs['ENABLE_PREVIEWS'] = 'YES'
  bs['GENERATE_INFOPLIST_FILE'] = 'NO'
  bs['INFOPLIST_FILE'] = "#{WATCH_FOLDER}/Info.plist"
  bs['INFOPLIST_KEY_CFBundleDisplayName'] = 'IronTracks'
  bs['INFOPLIST_KEY_UISupportedInterfaceOrientations'] = 'UIInterfaceOrientationPortrait UIInterfaceOrientationPortraitUpsideDown'
  bs['INFOPLIST_KEY_WKApplication'] = 'YES'
  bs['INFOPLIST_KEY_WKCompanionAppBundleIdentifier'] = HOST_BUNDLE_ID
  bs['INFOPLIST_KEY_WKWatchOnly'] = 'NO'
  bs['LD_RUNPATH_SEARCH_PATHS'] = '$(inherited) @executable_path/Frameworks'
  bs['MARKETING_VERSION'] = MARKETING_VERSION
  bs['PRODUCT_BUNDLE_IDENTIFIER'] = WATCH_BUNDLE_ID
  bs['PRODUCT_NAME'] = '$(TARGET_NAME)'
  bs['SDKROOT'] = 'watchos'
  bs['SKIP_INSTALL'] = 'NO'
  bs['SWIFT_EMIT_LOC_STRINGS'] = 'YES'
  bs['SWIFT_VERSION'] = '5.0'
  bs['TARGETED_DEVICE_FAMILY'] = '4'
  bs['WATCHOS_DEPLOYMENT_TARGET'] = '9.0'

  if config.name == 'Debug'
    bs['DEBUG_INFORMATION_FORMAT'] = 'dwarf'
    bs['ENABLE_TESTABILITY'] = 'YES'
    bs['GCC_DYNAMIC_NO_PIC'] = 'NO'
    bs['GCC_OPTIMIZATION_LEVEL'] = '0'
    bs['GCC_PREPROCESSOR_DEFINITIONS'] = ['DEBUG=1', '$(inherited)']
    bs['MTL_ENABLE_DEBUG_INFO'] = 'INCLUDE_SOURCE'
    bs['MTL_FAST_MATH'] = 'YES'
    bs['ONLY_ACTIVE_ARCH'] = 'YES'
    bs['SWIFT_ACTIVE_COMPILATION_CONDITIONS'] = ['DEBUG', '$(inherited)']
    bs['SWIFT_OPTIMIZATION_LEVEL'] = '-Onone'
  else
    bs['DEBUG_INFORMATION_FORMAT'] = 'dwarf-with-dsym'
    bs['MTL_ENABLE_DEBUG_INFO'] = 'NO'
    bs['MTL_FAST_MATH'] = 'YES'
    bs['SWIFT_OPTIMIZATION_LEVEL'] = '-O'
    bs['VALIDATE_PRODUCT'] = 'YES'
  end
end

# ─── 5. Embed Watch App no app iOS ────────────────────────────────────────
puts "→ Embeddando Watch App no target host (App)..."
host_target = project.targets.find { |t| t.name == 'App' }
abort "Host target 'App' não encontrado." unless host_target

# Adiciona como target dependency
unless host_target.dependencies.any? { |d| d.target == watch_target }
  host_target.add_dependency(watch_target)
end

# Embed Watch Content phase
embed_phase_name = 'Embed Watch Content'
embed_phase = host_target.copy_files_build_phases.find { |p| p.name == embed_phase_name }
unless embed_phase
  embed_phase = project.new(Xcodeproj::Project::Object::PBXCopyFilesBuildPhase)
  embed_phase.name = embed_phase_name
  embed_phase.dst_subfolder_spec = '16'  # = $(CONTENTS_FOLDER_PATH)/Watch
  embed_phase.dst_path = '$(CONTENTS_FOLDER_PATH)/Watch'
  host_target.build_phases << embed_phase
end

unless embed_phase.files.any? { |f| f.file_ref == product_ref }
  build_file = embed_phase.add_file_reference(product_ref)
  build_file.settings = { 'ATTRIBUTES' => ['RemoveHeadersOnCopy'] }
end

# ─── 6. Salvar ────────────────────────────────────────────────────────────
project.save
puts "\n✅  Target '#{TARGET_NAME}' criado com sucesso."
puts "   Bundle ID: #{WATCH_BUNDLE_ID}"
puts "   Companion: #{HOST_BUNDLE_ID}"
puts "   Próximo passo: xcodebuild -scheme '#{TARGET_NAME}' -sdk watchsimulator build"
