// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "RevenuecatPurchasesCapacitor",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "RevenuecatPurchasesCapacitor",
            targets: ["RevenuecatPurchasesCapacitor"])
    ],
    dependencies: [
        .package(path: "../capacitor-swift-pm"),
        .package(path: "../purchases-hybrid-common")
    ],
    targets: [
        .target(
            name: "RevenuecatPurchasesCapacitor",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "PurchasesHybridCommon", package: "purchases-hybrid-common")
            ],
            path: "ios/Sources/RevenuecatPurchasesCapacitor")
    ]
)
