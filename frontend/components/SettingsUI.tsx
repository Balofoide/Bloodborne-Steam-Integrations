import React from "react"
// Named imports only: millennium-ttc injects the plugin name into callable()
// by matching named imports; a namespace import (`import * as`) silently
// disables that for the whole bundle and every backend call fails.
import {
  DialogBodyText as SteamBodyText,
  DialogButton as SteamButton,
  DialogControlsSectionHeader as SteamSectionHeader,
  Field as SteamField,
  TextField as SteamTextField,
  ToggleField as SteamToggleField,
} from "@steambrew/client"
import { css, cx } from "../steam/classes"

// Steam's own settings controls (resolved from Steam's webpack by
// @steambrew/client), with look-alike fallbacks built from the same CSS
// modules (#2053 gamepad-dialog) in case a lookup fails after a Steam update.

type Node = React.ReactNode
// The SDK resolves these from Steam's webpack at runtime; any of them can be undefined.
type AnyComponent = React.ComponentType<Record<string, unknown>> | undefined
const native = {
  DialogBodyText: SteamBodyText as unknown as AnyComponent,
  DialogButton: SteamButton as unknown as AnyComponent,
  DialogControlsSectionHeader: SteamSectionHeader as unknown as AnyComponent,
  Field: SteamField as unknown as AnyComponent,
  TextField: SteamTextField as unknown as AnyComponent,
  ToggleField: SteamToggleField as unknown as AnyComponent,
}

export function SectionHeader({ children }: { children: Node }) {
  const C = native.DialogControlsSectionHeader
  return C ? <C>{children}</C> : <div className="DialogControlsSectionHeader">{children}</div>
}

export function BodyText({ children }: { children: Node }) {
  const C = native.DialogBodyText
  return C ? <C>{children}</C> : <div className="DialogBodyText">{children}</div>
}

/** Steam's Field: label + description on the left, control inline or below. */
export function Field({ label, description, below, children }: { label?: Node; description?: Node; below?: boolean; children?: Node }) {
  const C = native.Field
  if (C) return <C label={label} description={description} childrenLayout={below ? "below" : "inline"} bottomSeparator="standard">{children}</C>
  const f = css("field")
  const kids = children ? <div className={f.FieldChildrenWithIcon}><div className={f.FieldChildrenInner}>{children}</div></div> : null
  return (
    <div className={cx(f.Field, f.Classic, below ? f.WithChildrenBelow : Boolean(children) && f.WithChildrenInline, f.VerticalAlignCenter,
      f.WithBottomSeparatorStandard, f.ExtraPaddingOnChildrenBelow, f.StandardPadding, f.HighlightOnFocus)}>
      <div className={f.FieldLeftColumn}>
        {label && <div className={f.FieldLabelRow}><div className={f.FieldLabel}>{label}</div></div>}
        {below && kids}
        {description && <div className={f.FieldDescription}>{description}</div>}
      </div>
      {!below && kids && <div className={f.FieldRightColumn}>{kids}</div>}
    </div>
  )
}

export function ToggleField({ label, description, checked, onChange }: {
  label: Node; description?: Node; checked: boolean; onChange: (v: boolean) => void
}) {
  const C = native.ToggleField
  if (C) return <C label={label} description={description} checked={checked} onChange={onChange} bottomSeparator="standard" />
  const f = css("field")
  return (
    <Field label={label} description={description}>
      <div className={cx(f.Toggle, checked && f.On)} role="checkbox" aria-checked={checked} onClick={() => onChange(!checked)}>
        <div className={f.ToggleRail} />
        <div className={f.ToggleSwitch} />
      </div>
    </Field>
  )
}

export function TextField({ label, description, value, password, placeholder, onChange }: {
  label?: Node; description?: Node; value: string; password?: boolean; placeholder?: string; onChange: (v: string) => void
}) {
  const C = native.TextField
  if (C) {
    return (
      <C label={label} description={description} value={value} bIsPassword={password} type={password ? "password" : undefined} placeholder={placeholder}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)} />
    )
  }
  return (
    <Field label={label} description={description} below>
      <div className="DialogInput_Wrapper _DialogLayout Panel">
        <input type={password ? "password" : "text"} className="DialogInput DialogInputPlaceholder DialogTextInputBase Focusable"
          value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      </div>
    </Field>
  )
}

export function Button({ children, onClick, disabled }: {
  children: Node; onClick: (e?: React.MouseEvent<HTMLElement>) => void; disabled?: boolean
}) {
  const C = native.DialogButton
  if (C) return <C onClick={onClick} disabled={disabled}>{children}</C>
  return (
    <button type="button" className="DialogButton _DialogLayout Secondary Focusable" disabled={disabled} onClick={onClick}>
      {children}
    </button>
  )
}
