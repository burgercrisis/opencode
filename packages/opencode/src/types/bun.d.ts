declare const $: {
  <T extends string>(template: TemplateStringsArray, ...args: any[]): {
    nothrow(): {
      text(): Promise<string>
      quiet(): Promise<void>
    }
    text(): Promise<string>
    quiet(): Promise<void>
  }
}