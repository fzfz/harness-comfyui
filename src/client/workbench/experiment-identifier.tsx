import React from 'react'

export const shortId = (value: string) => value.length > 16 ? `${value.slice(0, 12)}…` : value

export function Identifier({ value }: { readonly value: string }) {
  return <span title={value}>{shortId(value)}</span>
}
