# 【译】SE-0302 Sendable and @Sendable closures（旧文搬运）

Created: September 14, 2021 2:12 PM
Last Edited Time: March 26, 2022 9:38 AM

Status: Archived

Tags: Swift

Type: 公众号

URL: https://github.com/apple/swift-evolution/blob/main/proposals/0302-concurrent-value-and-concurrent-closures.md

原文链接：[SE-0302 Sendable and @Sendable closures](https://github.com/apple/swift-evolution/blob/main/proposals/0302-concurrent-value-and-concurrent-closures.md)

- Proposal： [SE-0302](https://github.com/apple/swift-evolution/blob/main/proposals/0302-concurrent-value-and-concurrent-closures.md)
- Authors： [Chris Lattner](https://github.com/lattner), [Doug Gregor](https://github.com/douggregor)
- Review Manager: [John McCall](https://github.com/rjmccall)
- Status: **Accepted (2021-03-16)**
- Implementation: [apple/swift#35264](https://github.com/apple/swift/pull/35264)
- Major Contributors: Dave Abrahams, Paul Cantrell, Matthew Johnson, John McCall
- Review: ([first review](https://forums.swift.org/t/se-0302-Sendable-and-concurrent-closures/44919)) ([revision announcement](https://forums.swift.org/t/returned-for-revision-se-0302-concurrentvalue-and-concurrent-closures/45251)) ([second review](https://forums.swift.org/t/se-0302-second-review-sendable-and-sendable-closures/45253)) ([acceptance](https://forums.swift.org/t/accepted-se-0302-sendable-and-sendable-closures/45786))

# Introduction

一个影响 Swift 并发的关键目标是“提供一种机制来隔离并发程序中的状态以消除数据竞赛。“ 这样的机制对一个广泛使用的编程语言来说将是一个重大的进步 - 大部分编程语言都以一种使程序员面临各种错误的方式提供并发编程的抽象，包括竞赛条件、死锁和其他问题。

本提案描述了解决这一领域的一个挑战性问题的方法 - 如何对 structured concurrency constructs 与 actors messages 之间的值传递进行类型检查（type check）。因此，这是一个统一的理论，它提供了一些基本的类型系统机制，使其既安全又能很好地协同工作。

这种实现方法涉及到一个名为 `Sendable` 的 marker protocol，以及一个可应用于函数的 `@Sendable` 属性。

# Motivation

在程序中的每个 actor 实例与 structured concurrency task 都代表着一个“单线程的岛屿”。这使得它们成为一个自然的同步点，持有一袋可变的状态。这些任务与其他任务并行计算，但我们希望这样一个系统中的绝大多数代码都是无同步的 - 建立在 actor 逻辑上的独立性，并将它的 mailbox 作为数据的同步点

就这点而言，一个关键问题：“我们何时以及如何允许数据在并发域之间传递？“ 例如，这样的传递发生在 actor method 调用的参数和结果中，以及 structured concurrency 创建的 task 中。

Swift 并发特性渴望建立一个安全而强大的编程模型，我们想完成三件事：

1. 我们希望当 Swift 程序员试图跨并发域引入不受保护的共享状态时，得到一个编译器检查错误
2. 我们希望高级程序员能够使用复杂的技术（如并发哈希表）完成库实现，并安全的给被别人使用
3. 我们需要拥抱现实世界，大量的代码在设计时没有考虑 Swift 并发模型。我们需要能够平滑和渐进式的迁移

在我们跳到 [proposed solution](https://github.com/apple/swift-evolution/blob/main/proposals/0302-concurrent-value-and-concurrent-closures.md#proposed-solution--detailed-design) 之前，我们需要看一些常见情况，以及每个情况的机会和挑战。这会帮助我们推理出我们需要覆盖的设计空间

## 💖 Swift + Value Semantics

第一种我们需要支持的类型是类似 integers 的简单值。这些类型可以跨并发域传递，因为它们不包含指针。

除此之外，Swift 非常强调价值语义的类型，这些类型可以安全地跨并发边界传输。除了类以外，Swift 的类型组合机制在其成员提供值语义时，也提供值语义。这包括结构体泛型，以及集合：例如，`Dictionary<Int, String>`  可以直接跨并发域共享。Swift 的 `Copy On Write` 方法意味着集合可以在不主动复制数据的情况下传输。— 我相信这将是使 Swift 并发模型在实践中比其他系统更有效率的强大事实。

然而，事情没有这么简单：当集合包含一般的类引用、捕获可变状态的闭包以及其他非值类型时，它们不能安全地跨并发域传输。我们需要一种方法区分安全转移的案例和不安全的案例

## Value Semantic Composition

在 Swift 中，`structs`，`enums` 和 `tuples` 是值组合的主要模式。这些都是可以安全地跨并发域传输的--只要它们所包含的数据本身是可以安全传输的。

## Higher Order Functional Programming

在 Swift 和其他具有函数式编程根基的语言中，使用高阶编程是很常见的，即把函数传递给其他函数。函数在 Swift 中是引用类型，但是许多函数是能够安全的跨并发域传递 — 例如，空捕获列表（empty capture list）

这里有许多原因可以解释为什么你想以函数的形式在并发域之间发送计算比特 — 即使是像 `parallelMap` 这样微不足道的算法也需要这样做。这种情况在更大范围内也会发生--例如，考虑这样一个 actor 例子。

```swift
actor MyContactList {
  func filteredElements(_ fn: (ContactElement) -> Bool) async -> [ContactElement] { … }
}
```

然后可以像这样使用：

```swift
// Closures with no captures are ok!
list = await contactList.filteredElements { $0.firstName != "Max" }

// Capturing a 'searchName' string by value is ok, because strings are
// ok to pass across concurrency domains.
list = await contactList.filteredElements {
  [searchName] in $0.firstName == searchName
}
```

我们觉得让函数能够跨并发域传递是很重要的，但是我们也担心我们不应该允许在这些函数中通过引用来捕获本地状态，我们也不应该允许通过值来捕获不安全的东西。这两者都会带来内存安全问题。

## Immutable Classes

在并发编程中一个常见而有效的设计模式是建立不可变数据结构 — 如果一个类的状态没有改变，它的引用是可以安全的在跨并发域中转移。这种设计模式效率极高（不需要ARC以外的同步），可用于构建高级数据结构，并被纯函数语言社区广泛探索。

## Internally Synchronized Reference Types

在并发编程中一个常见的设计是类提供一个“线程安全” API：他们用来显式的同步（`mutexes`，`atomics`，等）保护他们的状态。因为该类的公共API可以从多个并发域安全使用，所以对该类的引用可以直接安全地转移。

actor 实例的引用就是一个例子：通过传递指针，他们能够在并发域之间安全传递，而在 actor 内的可变状态是被 actor mailbox 隐式保护

## “Transferring” Objects Between Concurrency Domains

在并发系统中一个常见的模式是一个并发域建立包含非同步可变状态的数据，然后通过原始指针“移交”（`hand it off`）给另外一个不同的并发域。如果（且仅当）发送方停止使用它所建立的数据，在没有同步的情况下是正确的。— 结果是每次只有发送方或接受方动态访问可变状态

有安全和不安全的方法来实现这一点，例如，见最后考虑的 [Alternatives Considered](https://github.com/apple/swift-evolution/blob/main/proposals/0302-concurrent-value-and-concurrent-closures.md#alternatives-considered) 部分中关于 "异国 "类型系统的讨论。

## Deep Copying Classes

一种转移引用类型的安全方式是对数据结构进行深度复制，确保源并发域和目的并发域都有自己的可变状态副本。这对大型结构来说可能很昂贵，但在一些Objective-C框架中是/曾经是常用的。一般的共识是，这应该是显式的，而不是隐含在类型定义中的东西。

## Motivation Conclusion

这仅仅是模式的一个例子，但是我们看到，有很多不同的并发设计模式被广泛的应用。Swift 围绕值类型的设计中心和鼓励使用结构体是非常强大和有用的开始点，但是我们需要能够对复杂例子进行推理—这既是为了那些希望能够为特定领域表达高性能API的社区，也是因为我们需要处理那些不会在一夜之间被重写的遗留代码。

因此，考虑允许库作者表达其类型意图的方法是很重要的，app 开发者能够追溯有问题的库也很重要，同样重要的是，我们要提供安全以及不安全的逃生通道，这样我们就可以在一个不完美的、处于过渡阶段的世界面前“把事情做好”。

最后，我们的目标是让Swift(一般情况下和本例中)成为一个可靠且易于使用的高度原则性的系统。在20年内，将为Swift及其最终并发模型建立许多新的库。这些库将围绕值语义类型构建，但也应该允许专业程序员部署最先进的技术，如无锁算法，使用不可变类型，或任何其他对他们的领域有意义的设计模式。我们希望这些api的用户不必关心它们在内部是如何实现的。

# Proposed Solution + Detailed Design

这个建议的高层设计是围绕 `Sendable` marker protocol，标准库类型采用 `Sendable` 协议，以及给函数新增一个 `@Sendable` 属性

除了这个基本的建议之外，将来还可以添加一组适配器类型来处理遗留兼容性问题，以及对Objective-C框架的一级支持。这些将在下一节中进行描述。

## Marker Protocols

本提案引入了 "标记 "协议的概念，这表明该协议具有某种语义属性，但完全是一个编译时的概念，在运行时没有任何影响。标记协议有以下限制。

- 不能有任何要求
- 不能从 non-marker protocol 继承
- 不能使用 is 或 as？检查（例如，`x  as? Sendable` 是错误的）
- marker protocol 不能用于 non-marker protocol 的泛型约束

我们认为这是一个普遍有用的功能，但认为在这一点上它应该是一个编译器内部的功能。因此，我们对它进行了解释，并在下面的"@_marker "属性语法中使用这一概念。

## Sendable Protocol

这个建议的核心是定义在 Swift 标准库的 marker protocol，它有特殊的一致性检查规则

```swift
@_marker
protocol Sendable {}
```

当类型被设计成他们所有的公共API能够安全的跨并发域使用，那么遵循 `Sendable` 协议是个好的主意。例如，当没有公共 mutators 时，如果公共 mutators 是用 COW 实现的，或者如果它们是用内部锁或其他机制实现的，这是正确的。如果类型将 lock 或 COW 作为其公共API的一部分，那么它们当然可以基于本地突变拥有内部实现细节。

编译器拒绝任何跨并发域传递数据的尝试，例如，拒绝 actor message 发送或 structured concurrency 调用的参数或结果不符合 `Sendable` 协议的情况。

```swift
actor SomeActor {
  // async functions are usable *within* the actor, so this
  // is ok to declare.
  func doThing(string: NSMutableString) async {...}
}

// ... but they cannot be called by other code not protected
// by the actor's mailbox:
func f(a: SomeActor, myString: NSMutableString) async {
  // error: 'NSMutableString' may not be passed across actors;
  //        it does not conform to 'Sendable'
  await a.doThing(string: myString)
}
```

`Sendable` 协议的模型是允许通过复制值来安全地跨并发域传递的类型。这包括值语义类型、不可变类型的引用、内部同步引用类型、`@Sendable` 闭包，以及未来可能的其他类型系统扩展，用于唯一所有权等。

请注意，不正确地遵守这个协议会在你的程序中引入错误（就像不正确地实现 `Hashable` 会破坏不变性一样），这就是为什么编译器会检查一致性（见下文）。

### **Tuple conformance to Sendable**

Swift 已经让 `tuples` 类型遵循了许多协议，当 `tuples` 的元素都遵循 `Sendable` 协议时，这也将扩展到 `Sendable`

### Metatype conformance to Sendable

Metatypes（例如 `Int.Type`, 由表达式 `Int.self` 产生的类型）总是符合 `Sendable`，因为它们是不可变的

### Sendable conformance checking for structs and enums

`Sendable` 类型在Swift中极为常见，它们的聚合体也可以安全地跨并发域传输。因此，Swift 编译器允许由其他 `Sendable` 类型组合成的 `structs` 和 `classes` 直接符合 `Sendable`

```swift
struct MyPerson : Sendable { var name: String, age: Int }
struct MyNSPerson { var name: NSMutableString, age: Int }

actor SomeActor {
  // Structs and tuples are ok to send and receive!
  public func doThing(x: MyPerson, y: (Int, Float)) async {..}

  // error if called across actor boundaries: MyNSPerson doesn't conform to Sendable!
  public func doThing(x: MyNSPerson) async {..}
}
```

虽然这很方便，但对于需要更多考虑的情况，我们希望稍微增加协议采用的难度。因此，当结构体和枚举的一个成员(或关联值)本身不符合 `Sendable` (或不知道通过泛型约束是否符合 `Sendable` )时，编译器拒绝符合Sendable协议的结构体和枚举:

```swift
// error: MyNSPerson cannot conform to Sendable due to NSMutableString member.
// note: add '@unchecked' if you know what you're doing.
struct MyNSPerson : Sendable {
  var name: NSMutableString
  var age: Int
}

// error: MyPair cannot conform to Sendable due to 'T' member which may not itself be a Sendable
// note: see below for use of conditional conformance to model this
struct MyPair<T> : Sendable {
  var a, b: T
}

// use conditional conformance to model generic types
struct MyCorrectPair<T> {
  var a, b: T
}

extension MyCorrectPair: Sendable where T: Sendable { }
```

编译器诊断提及，任何类型通过将一致性标注为 `@unchecked`  来覆盖此检查行为。这表明类型可以安全地跨并发域传递，但需要类型的作者确保这是安全的。

`struct` 和 `enum` 只能在源文件定义类型中遵循 `Sendable`，这确保了 `struct` 中的 `stored properties` 和 `enum` 中的 `associated value` 是可见的，以便检查他们的类型是否符合 `Sendable`。例如：

```swift
// MySneakyNSPerson.swift
struct MySneakyNSPerson {
  private var name: NSMutableString
  public var age: Int
}

// in another source file or module...
// error: cannot declare conformance to Sendable outside of
// the source file defined MySneakyNSPerson
extension MySneakyNSPerson: Sendable { }
```

如果没有这个限制，另一个源文件或模块，不能看到私有存储的属性名，会得出 MySneakyNSPerson 是一个合适的 `Sendable` 。我们可以将与 `Sendable` 的一致性声明为`@unchecked`，以禁用这个检查。

```swift
// in another source file or module...
// okay: unchecked conformances in a different source file are permitted
extension MySneakyNSPerson: @unchecked Sendable { }
```

### Implicit struct/enum conformance to Sendable

许多结构和枚举都满足 `Sendable` 的要求，如果要为每一个这样的类型显式地写出"：`Sendable`"，会让人感觉像模板。对于不属于 `@usableFromInline` 的 non-public `structs` 和 `enums`，以及 frozen public `structs` 和 `enums`，当一致性检查（在上一节中描述）成功时，会隐式遵循 Sendable 协议

```swift
struct MyPerson2 { // Implicitly conforms to Sendable!
  var name: String, age: Int
}

class NotConcurrent { } // Does not conform to Sendable

struct MyPerson3 { // Does not conform to Sendable because nc is of non-Sendable type
  var nc: NotConcurrent
}
```

public non-frozen `structs` 和 `enums` 没有得到隐含的一致性，因为这样做会给API的弹性带来问题：对Sendable的隐含一致性会成为与API客户的契约的一部分，即使它不是有意的。此外，这种契约很容易被用不符合Sendable的存储方式来扩展 `structs` 或 `enums` 而破坏。

> 理由：来自`Hashable`、`Equatable`和`Codable`的现有先例是要求明确的一致性，即使是在细节被合成的时候。我们为`Sendable`打破了这个先例，因为（1）`Sendable`可能会更加普遍，（2）`Sendable`对代码大小（或二进制）没有影响，与其他协议不同，以及（3）`Sendable`除了允许跨并发域使用该类型外，没有引入任何额外的API。
> 

注意隐式遵循 `Sendable` 只适用于非泛型类型和其实例数据被保证为 `Sendable` 的泛型类型。举例来说：

```swift
struct X<T: Sendable> {  // implicitly conforms to Sendable
  var value: T
}

struct Y<T> {    // does not implicitly conform to Sendable because T does not conform to Sendable
  var value: T
}
```

Swift 将不会隐含地引入条件一致性。这有可能在未来的提案中被引入。

### Sendable conformance checking for classes

任何类都可以通过 `@unchecked` 的一致性声明为符合 `Sendable` ，允许它们在参与者之间传递而不需要进行语义检查。这适用于使用访问控制和内部同步来提供内存安全的类——编译器通常不能检查这些机制。

此外，在特定的有限情况下，一个类可以符合 `Sendable` 并由编译器检查内存安全:当类是final类，只包含符合 `Sendable` 类型的不可变存储属性时:

```swift
final class MyClass : Sendable {
  let state: String
}
```

这样的类不能从 `NSObject` 以外的类继承(对于 `Objective-C` 的互操作性)。`Sendable` classes 具有与 structs 和 enums 相同的限制，这些限制要求 `Sendable` 一致性出现在同一个源文件中。

这种行为使得在 actors 之间安全地创建和传递不可变的共享状态袋成为可能。在未来，有几种方法可以将其泛化，但有一些不明显的情况需要确定下来。因此，本建议有意保持对类的安全检查，以确保我们在并发性设计的其他方面取得进展。

### Actor types

Actor 类型提供它们自己的内部同步，因此它们隐式地符合 `Sendable`。[actor proposal](https://github.com/apple/swift-evolution/blob/main/proposals/0306-actors.md) 提供了更多细节。

### Key path literals

`Key paths` 本身符合 `Sendable` 协议。然而，为了确保共享 `key paths` 的安全性，`key paths` 字面量只能捕获符合 `Senable` 协议的类型的值。这影响了键路径中下标的使用。

```swift
class SomeClass: Hashable {
  var value: Int
}

class SomeContainer {
  var dict: [SomeClass : String]
}

let sc = SomeClass(...)

// error: capture of 'sc' in key path requires 'SomeClass' to conform
// to 'Sendable'
let keyPath = \SomeContainer.dict[sc]
```

## New @Sendable attribute for functions

虽然 `Sendable` 协议直接针对值类型，并允许类选择参与并发系统，但函数类型也是目前无法符合协议的重要参考类型。Swift 中的函数有几种形式，包括全局 func 声明、嵌套函数、访问器（`getters`、`setters`、`subscripts`等）和闭包。在可能的情况下，允许函数跨并发域传递，以允许 Swift 并发模型中的高阶函数式编程技术，例如允许定义 `parallelMap` 和其他明显的并发构造，这是非常有用和重要的。

我们建议在函数类型上定义一个名为 `@Sendable` 的新属性。一个 `@Sendable` 函数类型可以安全地跨并发域传输（因此，它隐含地符合 `Sendable` 协议）。为了确保内存安全，编译器会检查关于具有 `@Sendable` 函数类型的值（例如闭包和函数）的几件事。

1. 函数可以标记为 `@Sendable` 。任何捕获也必须符合 `Sendable` 。
2. 具有 `@Sendable` 函数类型的闭包只能使用按值捕获。由 `let` 引入的不可变值的捕获是隐式的按值捕获;任何其他捕获必须通过捕获列表指定:
    
    ```swift
    let prefix: String = ...
    var suffix: String = ...
    strings.parallelMap { [suffix] in prefix + $0 + suffix }
    ```
    
    所有捕获值的类型必须符合 `Sendable` 。
    
3. 在本提案中，存取器目前不允许参与 `@Sendable` 系统。如果有这方面的需求，在未来的提案中允许存取器这样做将是直接的。

函数类型的 `@Sendable` 属性与现有的 `@escaping` 属性是正交的，但其工作方式是相同的。 `@Sendable` 函数总是 `non-@Sendable` 函数的子类型，并在需要时隐式转换。类似地，闭包表达式从上下文推断 `@Sendable` 位，就像 `@escaping` 闭包一样。

我们可以重温一下 motivation 部分的例子--它可以这样声明。

```swift
actor MyContactList {
  func filteredElements(_ fn: @Sendable (ContactElement) -> Bool) async -> [ContactElement] { … }
}
```

然后可以像这样使用。

```swift
// Closures with no captures are ok!
list = await contactList.filteredElements { $0.firstName != "Max" }

// Capturing a 'searchName' string is ok, because String conforms
// to Sendable.  searchName is captured by value implicitly.
list = await contactList.filteredElements { $0.firstName==searchName }

// @Sendable is part of the type, so passing a compatible
// function declaration works as well.
list = await contactList.filteredElements(dynamicPredicate)

// Error: cannot capture NSMutableString in a @Sendable closure!
list = await contactList.filteredElements {
  $0.firstName == nsMutableName
}

// Error: someLocalInt cannot be captured by reference in a
// @Sendable closure!
var someLocalInt = 1
list = await contactList.filteredElements {
  someLocalInt += 1
  return $0.firstName == searchName
}
```

`@Sendable` Closure 和 `Sendable` 类型的结合允许类型安全的并发，它是可扩展的库，同时仍然易于使用和理解。这两个概念都是关键的基础，actors 和 structured concurrency 建立在其之上。

### Inference of @Sendable for Closure Expressions

闭包表达式 `@Sendable` 属性的推理规则类似于闭包 `@escaping` 推理。闭包表达式被推断为`@Sendable`，如果:

- 它被用于期望有 `@Sendable` 函数类型的上下文中（例如 `parallelMap` 或 `Task.runDetached` ）。
- 当 `@Sendable` 在闭包" in "规范中。

与 `@escaping` 的区别在于，无上下文 Closure 默认为 `non-@Sendable` ，但是 `@escaping`:

```swift
// defaults to @escaping but not @Sendable
let fn = { (x: Int, y: Int) -> Int in x+y }
```

嵌套函数也是一个重要的考虑因素，因为它们也可以像闭包表达式一样捕获值。在嵌套函数声明中使用 `@Sendable` 属性来选择加入并发检查。

```swift
func globalFunction(arr: [Int]) {
  var state = 42

  // Error, 'state' is captured immutably because closure is @Sendable.
  arr.parallelForEach { state += $0 }

  // Ok, function captures 'state' by reference.
  func mutateLocalState1(value: Int) {
    state += value
  }

  // Error: non-@Sendable function isn't convertible to @Sendable function type.
  arr.parallelForEach(mutateLocalState1)

  @Sendable
  func mutateLocalState2(value: Int) {
    // Error: 'state' is captured as a let because of @Sendable
    state += value
  }

  // Ok, mutateLocalState2 is @Sendable.
  arr.parallelForEach(mutateLocalState2)
}
```

这对 structured concurrency 和 actor 来说都是干净利落的组合。

## Thrown errors

一个 `throws` 类型的函数或闭包可以有效地返回一个符合 `Error` 协议的任何类型的值。如果该函数是从不同的并发域中调用的，那么抛出的值可以在其间传递。

```swift
class MutableStorage {
  var counter: Int
}
struct ProblematicError: Error {
  var storage: MutableStorage
}

actor MyActor {
  var storage: MutableStorage
  func doSomethingRisky() throws -> String {
    throw ProblematicError(storage: storage)
  }
}
```

从另一个并发域调用 `myActor.doSomethingRisky()` 将抛出有问题的错误，捕获 `myActor` 的部分可变状态，然后提供给另一个并发域，破坏了  `actor isolation` 。因为 `doSomethingRisky()` 的签名中没有关于抛出的错误类型的信息，而且从 `doSomethingRisky()` 传播出去的错误可能来自该函数调用的任何代码，所以我们没有地方可以检查是否只抛出符合 `Sendable` 标准的错误。

为了填补这个安全漏洞，我们改变了错误协议的定义，要求所有错误类型都符合 `Sendable`。

```swift
protocol Error: Sendable { … }
```

现在，`ProblematicError` 类型将被错误地拒绝，因为它符合 `Sendable`，但包含一个非 `Sendable` 类型 `MutableStorage` 的存储属性。

一般来说，在不破坏源码和二进制兼容性的情况下，不能在现有协议上增加新的继承协议。然而，标记协议对 ABI 没有影响，也没有要求，所以二进制兼容性可以保持。

然而，源码兼容性需要更加小心。`ProblematicError` 在今天的 Swift 中是格式良好的，但在引入 `Sendable` 后将被拒绝。为了便于过渡，在 Swift < 6 中，通过 `Error` 获得 `Sendable` 符合性的类型的错误将被降级为警告。

### Adoption of Sendable by Standard Library Types

对于标准库类型来说，跨并发域传递是很重要的。绝大多数的标准库类型都提供了值语义，因此应该符合 `Sendable`，例如。

```swift
extension Int: Sendable {}
extension String: Sendable {}
```

只要任何元素类型可以安全地跨并发域传递，通用的值语义类型就可以安全地跨并发域传递。这种依赖性可以通过条件性的符合性来进行建模。

```swift
extension Optional: Sendable where Wrapped: Sendable {}
extension Array: Sendable where Element: Sendable {}
extension Dictionary: Sendable
    where Key: Sendable, Value: Sendable {}
```

除了下面列出的情况，标准库中的所有 `structs`、`enums` 和 `classes` 的类型都符合 `Sendable` 协议。当泛型的所有参数都符合Sendable协议时，泛型就有条件地符合 Sendable 协议。这些规则的例外情况如下。

- `ManagedBuffer`：该类旨在为一个缓冲区提供可变的引用语义。它必须不符合Sendable（甚至不安全地）。
- `Unsafe(Mutable)(Buffer)Pointer`：这些泛型无条件地符合Sendable协议。这意味着指向非并发值的不安全指针可能用于在并发域之间共享这些值。不安全的指针类型提供对内存的根本不安全访问，必须信任程序员才能正确使用它们;对一个狭窄的维度执行严格的安全规则，否则完全不安全的使用，似乎与设计不符。
- 延迟算法适配器类型：由延迟算法返回的类型（例如，作为 `array.lazy.map { ... }`的结果）从不符合 `Sendable`。许多这样的算法（比如 lazy map）采取非 @Sendable 闭合值，因此不能安全地符合 `Sendable`。

标准库协议 `Error` 和 `CodingKey` 继承自 `Sendable` 协议：

- `Error` 继承自 `Sendable`，以确保抛出的错误可以安全地跨并发域传递，正如上一节中所讨论的。
- `CodingKey` 继承自 `Sendable` ，所以像 `EncodingError` 和 `DecodingError` 这样存储 `CodingKey` 实例的类型可以正确地符合 `Sendable` 。

### Support for Imported C / Objective-C APIs

与 C 和 Objective-C 的互操作性是 Swift 的一个重要部分。C 代码对于并发来说总是隐含的不安全，因为 Swift 无法强制执行 C API 的正确行为。然而，我们仍然通过为许多 C 类型提供隐式 `Sendable` 符合性来定义与并发模型的一些基本互动。

- C enum 类型总是符合 `Sendable` 协议。
- 如果 C struct 类型的所有存储属性都符合 `Sendable` 协议，那么它就符合 `Sendable` 协议。
- C语言的函数指针符合 `Sendable` 协议。这是很安全的，因为它们不能捕获值。

# Future Work / Follow-on Projects

除了基本建议之外，还有一些后续建议可以作为后续建议进行探索。

## Adaptor Types for Legacy Codebases

注意：本节不被认为是提案的一部分--包括它只是为了说明设计的各个方面。

上述提议为更新后支持并发的组合和 Swift 类型提供了良好的支持。此外，Swift对协议追溯一致性的支持使用户有可能使用尚未更新的代码库。

然而，在与现有框架的兼容性方面，还有一个重要的方面需要面对：框架有时是围绕着具有特殊结构的密集的可变对象图设计的。虽然最终能 "重写世界 "是件好事，但实际的Swift程序员将需要支持，以便在这期间 "完成工作"。以此类推，当Swift刚出来的时候，大多数Objective-C框架都没有对`nullability` 进行审核。我们引入了 "ImplicitlyUnwrappedOptional "来处理过渡期的问题，随着时间的推移，它优雅地淡出了使用范围。

为了说明我们如何在Swift并发中做到这一点，请考虑Objective-C框架中常见的一种模式：通过跨线程 "转移 "引用来传递一个对象图--这很有用，但不符合内存安全 程序员会希望能够在他们的应用程序中把这些东西作为actor API的一部分来表达。

这可以通过引入一个通用的辅助结构来实现。

```swift
@propertyWrapper
struct UnsafeTransfer<Wrapper> : @unchecked Sendable {
  var wrappedValue: Wrapped
  init(wrappedValue: Wrapped) {
    self.wrappedValue = wrappedValue
  }
}
```

例如，`NSMutableDictionary`在跨并发域传递时并不安全，所以它在符合`Sendable`时也不安全。上面的结构允许你（作为应用程序的程序员）在你的应用程序中这样写一个 actor API。

```swift
actor MyAppActor {
  // The caller *promises* that it won't use the transferred object.
  public func doStuff(dict: UnsafeTransfer<NSMutableDictionary>) async
}
```

虽然这不是特别漂亮，但当你需要处理未经审计和不安全的代码时，它能有效地在调用者一方完成工作。这也可以使用最近提出的参数的属性包装器的扩展，变成一个参数属性，允许一个更漂亮的声明和调用方的语法。

```swift
actor MyAppActor {
  // The caller *promises* that it won't use the transferred object.
  public func doStuff(@UnsafeTransfer dict: NSMutableDictionary) async
}
```

## Objective-C Framework Support

注意：这一部分不被认为是提案的一部分--它只是为了说明设计的各个方面。

Objective-C已经建立了一些模式，将其全部拉入这个框架，例如，`NSCopying`协议是一个重要的、被广泛采用的协议，应该被纳入这个框架。

一般的共识是，在模型中明确复制是很重要的，所以我们可以像这样实现一个NSCopied帮助器。

```swift
@propertyWrapper
struct NSCopied<Wrapped: NSCopying>: @unchecked Sendable {
  let wrappedValue: Wrapped

  init(wrappedValue: Wrapped) {
    self.wrappedValue = wrappedValue.copy() as! Wrapped
  }
}
```

这将允许 actor methods 的个别参数和结果选择进入这样的副本。

```swift
actor MyAppActor {
  // The string is implicitly copied each time you invoke this.
  public func lookup(@NSCopied name: NSString) -> Int async
}
```

一个随机的说明：Objective-C的静态类型系统在这里对我们的不变性帮助不大：静态类型的`NSString`的由于其子类关系，实际上可能是动态的`NSMutableString`的。正因为如此，假设`NSString`类型的值是动态不变的并不安全--它们应该被实现为调用`copy()`方法。

## Interaction of Actor self and @Sendable closures

Actors 是一个在概念上分层的提案，但重要的是要了解 actor 的设计，以确保本提案能满足其需求。如上所述，actor method 跨越并发边界的发送自然要求参数和结果符合 `Sendable`，因此隐含地要求跨越这种边界传递的闭包是 @Sendable。

一个需要解决的额外细节是 "什么时候是跨 actor 调用？"。例如，我们希望这些调用是同步的，不需要等待。

```swift
extension SomeActor {
  public func oneSyncFunction(x: Int) {... }
  public func otherSyncFunction() {
    // No await needed: stays in concurrency domain of self actor.
    self.oneSyncFunction(x: 42)
    oneSyncFunction(x: 7)    // Implicit self is fine.
  }
}
```

然而，我们也需要考虑当 "self "被捕获到 actor method 中的一个 closure 时的情况。比如说。

```swift
extension SomeActor {
  public func thing(arr: [Int]) {
    // This should obviously be allowed!
    arr.forEach { self.oneSyncFunction(x: $0) }

    // Error: await required because it hops concurrency domains.
    arr.parallelMap { self.oneSyncFunction(x: $0) }

    // Is this ok?
    someHigherOrderFunction {
      self.oneSyncFunction(x: 7)  // ok or not?
    }
  }
}
```

我们需要编译器知道是否有一个可能的并发域跳跃--如果有，就需要一个 await 。幸运的是，这可以通过上述基本类型系统规则的直接组合来解决。在 actor 方法中的非 `@Sendable` 闭包中使用 actor self 是完全安全的，但是在@Sendable闭包中使用它被视为来自不同的并发域，因此需要一个await。

## Marker protocols as custom attributes

marker protocol 的 `Sendable` 和函数属性 `@Sendable` 被故意赋予相同的名字。这里有一个潜在的未来方向，即 `@Sendable` 可以从一个被编译器识别的特殊属性（如在这个提议中），转变为让Sendable这样的 marker protocol 成为像属性包装器和结果构建器这样的自定义属性。这样的改变对使用 `@Sendable` 的现有代码的影响很小，只要用户不声明他们自己的 `Sendable` 类型来影射标准库中的类型。然而，它将使 @Sendable 不再特殊，并允许其他 marker protocol 被类似地使用。

# Source Compatibility

这几乎与现有的代码库完全源代码兼容。引入 Sendable marker protocol 和 `@Sendable` 函数是附加功能，不使用时没有影响，因此不影响现有代码。

有一些新的限制，在特殊情况下可能会导致源码断裂。

- 对 keypath 字面下标的改变会破坏那些用非标准类型索引的奇异 keypath 。
- `Error` 和 `CodingKey` 继承自 `Sendable` ，因此要求自定义错误和键符合 `Sendable` 。

由于这些变化，新的限制将只在Swift 6模式下执行，但对于Swift 5和更早的版本将是警告。

# Effect on API resilience

这项建议对API的弹性没有任何影响!

# Alternatives Considered

在讨论这个建议时，有几个备选方案是有意义的。在这里，我们抓住一些较大的问题。

## Exotic Type System Features

[Swift Concurrency Roadmap](https://forums.swift.org/t/swift-concurrency-roadmap/41611) 提到，未来的功能集迭代可能会引入新的类型系统功能，如 "mutableIfUnique "类，而且很容易想象，移动语义和唯一所有权有一天会被引入Swift。

虽然在不了解未来提案的完整规范的情况下很难理解详细的交互，但我们相信执行 `Sendable` 检查的检查机制是简单和可组合的。它应该适用于任何可以跨并发边界安全传递的类型。

## Support an explicit copy hook

[该提案的第一次修订](https://docs.google.com/document/d/1OMHZKWq2dego5mXQtWt1fm-yMca2qeOdCl8YlBG1uwg/edit#)允许类型在跨并发域发送时定义自定义行为，通过实施unsafeSend协议要求。这增加了提案的复杂性，承认了不想要的功能（明确实现的复制行为），使递归聚合的情况更加昂贵，并且会导致更大的代码量。

# Conclusion

这项建议定义了一种非常简单的方法，用于定义可以安全地跨并发域传输的类型。它需要最小的编译器/语言支持，与现有的 Swift 功能一致，可由用户扩展，与传统的代码库一起使用，并提供了一个简单的模型，即使在20年后我们也能感觉良好。

因为该功能主要是建立在现有语言支持基础上的库功能，所以很容易定义包装类型，为特定领域的关注点进行扩展（按照上面NSCopied的例子），追溯一致性使用户很容易与尚未更新以了解 Swift 并发模型的旧库合作。

# Revision history

- 第二次审查的变化。
    - 根据审查反馈和核心团队的决定，将@sendable重命名为@Sendable。
    - 增加了一个关于标记协议作为自定义属性的未来方向。
    删除了 "Swift Concurrency 1.0 "和 "2.0 "中的备选方案考虑的讨论。
- 第一次审查时的改动
    - 将 ConcurrentValue 重命名为 Sendable，将 @concurrent 重命名为 @sendable。
    - 用 @unchecked Sendable 符合性替换 UnsafeConcurrentValue
    - 为非公共的、非冻结的结构体和枚举类型增加了Sendable的隐式一致性。