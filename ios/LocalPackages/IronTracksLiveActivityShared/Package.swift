// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "IronTracksLiveActivityShared",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "IronTracksLiveActivityShared",
            targets: ["IronTracksLiveActivityShared"])
    ],
    targets: [
        .target(
            name: "IronTracksLiveActivityShared",
            dependencies: [],
            path: "Sources/IronTracksLiveActivityShared")
    ]
)
