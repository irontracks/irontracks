#!/usr/bin/env ruby
# frozen_string_literal: true
#
# Adiciona o arquivo App/WatchBridge.swift ao target "App" se ainda não estiver.
# Idempotente.

require 'xcodeproj'
require 'fileutils'

PROJECT_PATH = File.expand_path('../ios/App/App.xcodeproj', __dir__)
FILE_PATH    = 'App/WatchBridge.swift'  # relativo à raiz do projeto Xcode
TARGET_NAME  = 'App'

project = Xcodeproj::Project.open(PROJECT_PATH)

target = project.targets.find { |t| t.name == TARGET_NAME }
abort "Target '#{TARGET_NAME}' não encontrado." unless target

# Verifica se o arquivo já está no target
already = target.source_build_phase.files.any? do |bf|
  ref = bf.file_ref
  ref && (ref.path == FILE_PATH || ref.real_path.to_s.end_with?('WatchBridge.swift'))
end

if already
  puts "✓ WatchBridge.swift já está no target #{TARGET_NAME}."
  exit 0
end

# Adiciona à hierarquia
app_group = project.main_group.find_subpath('App', false)
abort "Group 'App' não encontrado no project navigator." unless app_group

ref = app_group.find_file_by_path('WatchBridge.swift')
unless ref
  ref = app_group.new_reference('WatchBridge.swift')
end

target.source_build_phase.add_file_reference(ref)
project.save
puts "✅ WatchBridge.swift adicionado ao target #{TARGET_NAME}."
