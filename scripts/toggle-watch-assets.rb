#!/usr/bin/env ruby
# Toggle inclusion of Assets.xcassets in the Watch target's resources phase.
# Useful when the watchOS simulator runtime is missing — actool fails on every
# build but the Swift code compiles fine. We can validate the code via a
# disabled-assets build, then re-enable.

require 'xcodeproj'

PROJECT = File.expand_path('../ios/App/App.xcodeproj', __dir__)
TARGET  = 'IronTracksWatch Watch App'
ACTION  = ARGV[0] || 'status'  # disable | enable | status

project = Xcodeproj::Project.open(PROJECT)
target  = project.targets.find { |t| t.name == TARGET }
abort "Target não encontrado." unless target

resources_phase = target.resources_build_phase
abort "Resources phase não encontrada." unless resources_phase

asset_files = resources_phase.files.select do |f|
  f.file_ref && f.file_ref.last_known_file_type == 'folder.assetcatalog'
end

case ACTION
when 'disable'
  if asset_files.empty?
    puts "Já está disabled (nenhum asset catalog na phase)."
  else
    asset_files.each { |f| resources_phase.files.delete(f) }
    project.save
    puts "✓ Disabled: removidos #{asset_files.size} asset catalog(s) da resources phase."
  end
when 'enable'
  if !asset_files.empty?
    puts "Já está enabled."
  else
    # Re-adiciona os assets do project navigator
    watch_group = project.main_group.find_subpath(TARGET, false)
    abort "Group não encontrado." unless watch_group
    watch_group.children.each do |child|
      next unless child.respond_to?(:last_known_file_type) && child.last_known_file_type == 'folder.assetcatalog'
      resources_phase.add_file_reference(child)
    end
    project.save
    puts "✓ Enabled: assets re-adicionados."
  end
when 'status'
  puts "Asset catalogs no target: #{asset_files.size}"
  asset_files.each { |f| puts "  - #{f.file_ref.path}" }
else
  abort "Uso: ruby toggle-watch-assets.rb [disable|enable|status]"
end
