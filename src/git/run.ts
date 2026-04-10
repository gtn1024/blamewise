export async function git(...args: string[]): Promise<string> {
  const result = await Bun.$`git ${args}`.quiet()
  return result.text()
}

export async function gitLines(...args: string[]): Promise<string[]> {
  const text = await git(...args)
  return text.split('\n').filter(Boolean)
}
