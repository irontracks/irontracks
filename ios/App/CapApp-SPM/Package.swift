// swift-tools-version: 5.9
import PackageDescription

// DO NOT MODIFY THIS FILE - managed by Capacitor CLI commands
let package = Package(
    name: "CapApp-SPM",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "CapApp-SPM",
            targets: ["CapApp-SPM"])
    ],
    dependencies: [
        .package(name: "capacitor-swift-pm", path: "../../LocalPackages/capacitor-swift-pm"),
        .package(name: "CapacitorCommunityAppleSignIn", path: "../../LocalPackages/CapacitorCommunityAppleSignIn"),
        .package(name: "RevenuecatPurchasesCapacitor", path: "../../LocalPackages/RevenuecatPurchasesCapacitor")
    ],
    targets: [
        .target(
            name: "CapApp-SPM",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "CapacitorCommunityAppleSignIn", package: "CapacitorCommunityAppleSignIn"),
                .product(name: "RevenuecatPurchasesCapacitor", package: "RevenuecatPurchasesCapacitor")
            ]
        )
    ]
)
