// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "IronTracksNative",
    platforms: [.iOS(.v14)],
    products: [
        .library(
            name: "IronTracksNative",
            targets: ["IronTracksNative"])
    ],
    dependencies: [
        .package(path: "../capacitor-swift-pm"),
        .package(path: "../IronTracksLiveActivityShared")
    ],
    targets: [
        .target(
            name: "IronTracksNative",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "IronTracksLiveActivityShared", package: "IronTracksLiveActivityShared")
            ],
            path: "ios/Sources/IronTracksNative")
    ]
)
