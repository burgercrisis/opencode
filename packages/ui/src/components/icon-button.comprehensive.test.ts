import { beforeAll, describe, expect, mock, test } from "bun:test"
import { render, screen, fireEvent } from "@solidjs/testing-library"
import { IconButton } from "./icon-button"

// Mock dependencies
beforeAll(async () => {
  mock.module("@kobalte/core/button", () => ({
    Button: (props: any) => (
      <button {...props} data-testid="kobalte-button">
        {props.children}
      </button>
    ),
  }))

  mock.module("./icon", () => ({
    Icon: (props: any) => (
      <span data-testid="icon" data-name={props.name} data-size={props.size}>
        {props.name}
      </span>
    ),
  }))
})

describe("IconButton component", () => {
  test("renders with required props", () => {
    render(() => (
      <IconButton icon="test-icon" />
    ))

    const button = screen.getByTestId("kobalte-button")
    const icon = screen.getByTestId("icon")

    expect(button).toBeInTheDocument()
    expect(button).toHaveAttribute("data-component", "icon-button")
    expect(button).toHaveAttribute("data-icon", "test-icon")
    expect(button).toHaveAttribute("data-size", "normal")
    expect(button).toHaveAttribute("data-variant", "secondary")

    expect(icon).toBeInTheDocument()
    expect(icon).toHaveAttribute("data-name", "test-icon")
    expect(icon).toHaveAttribute("data-size", "small")
  })

  test("renders with custom size", () => {
    render(() => (
      <IconButton icon="test-icon" size="large" />
    ))

    const button = screen.getByTestId("kobalte-button")
    const icon = screen.getByTestId("icon")

    expect(button).toHaveAttribute("data-size", "large")
    expect(icon).toHaveAttribute("data-size", "normal") // Large buttons get normal icons
  })

  test("renders with small size", () => {
    render(() => (
      <IconButton icon="test-icon" size="small" />
    ))

    const button = screen.getByTestId("kobalte-button")
    const icon = screen.getByTestId("icon")

    expect(button).toHaveAttribute("data-size", "small")
    expect(icon).toHaveAttribute("data-size", "small")
  })

  test("renders with custom icon size", () => {
    render(() => (
      <IconButton icon="test-icon" iconSize="large" />
    ))

    const icon = screen.getByTestId("icon")
    expect(icon).toHaveAttribute("data-size", "large")
  })

  test("icon size overrides default size behavior", () => {
    render(() => (
      <IconButton icon="test-icon" size="large" iconSize="small" />
    ))

    const icon = screen.getByTestId("icon")
    expect(icon).toHaveAttribute("data-size", "small") // iconSize takes precedence
  })

  test("renders with primary variant", () => {
    render(() => (
      <IconButton icon="test-icon" variant="primary" />
    ))

    const button = screen.getByTestId("kobalte-button")
    expect(button).toHaveAttribute("data-variant", "primary")
  })

  test("renders with ghost variant", () => {
    render(() => (
      <IconButton icon="test-icon" variant="ghost" />
    ))

    const button = screen.getByTestId("kobalte-button")
    expect(button).toHaveAttribute("data-variant", "ghost")
  })

  test("renders with custom class", () => {
    render(() => (
      <IconButton icon="test-icon" class="custom-class" />
    ))

    const button = screen.getByTestId("kobalte-button")
    expect(button).toHaveClass("custom-class")
  })

  test("renders with custom classList", () => {
    render(() => (
      <IconButton icon="test-icon" classList={{ "custom-class": true, "another-class": false }} />
    ))

    const button = screen.getByTestId("kobalte-button")
    expect(button).toHaveClass("custom-class")
    expect(button).not.toHaveClass("another-class")
  })

  test("renders with both class and classList", () => {
    render(() => (
      <IconButton 
        icon="test-icon" 
        class="base-class" 
        classList={{ "custom-class": true }} 
      />
    ))

    const button = screen.getByTestId("kobalte-button")
    expect(button).toHaveClass("base-class")
    expect(button).toHaveClass("custom-class")
  })

  test("passes through other button props", () => {
    render(() => (
      <IconButton 
        icon="test-icon" 
        disabled={true}
        aria-label="Test button"
        onClick={mock()}
      />
    ))

    const button = screen.getByTestId("kobalte-button")
    expect(button).toHaveAttribute("disabled")
    expect(button).toHaveAttribute("aria-label", "Test button")
  })

  test("handles click events", () => {
    const handleClick = mock()
    render(() => (
      <IconButton icon="test-icon" onClick={handleClick} />
    ))

    const button = screen.getByTestId("kobalte-button")
    fireEvent.click(button)

    expect(handleClick).toHaveBeenCalled()
  })

  test("renders different icon names", () => {
    const icons = ["settings", "user", "home", "search", "menu"]
    
    icons.forEach((iconName) => {
      const { unmount } = render(() => (
        <IconButton icon={iconName} />
      ))

      const icon = screen.getByTestId("icon")
      expect(icon).toHaveAttribute("data-name", iconName)
      
      unmount()
    })
  })

  test("handles all size combinations", () => {
    const sizeCombinations = [
      { size: "small" as const, expectedIconSize: "small" },
      { size: "normal" as const, expectedIconSize: "small" },
      { size: "large" as const, expectedIconSize: "normal" },
    ]

    sizeCombinations.forEach(({ size, expectedIconSize }) => {
      const { unmount } = render(() => (
        <IconButton icon="test-icon" size={size} />
      ))

      const button = screen.getByTestId("kobalte-button")
      const icon = screen.getByTestId("icon")

      expect(button).toHaveAttribute("data-size", size)
      expect(icon).toHaveAttribute("data-size", expectedIconSize)
      
      unmount()
    })
  })

  test("handles all variant combinations", () => {
    const variants = ["primary" as const, "secondary" as const, "ghost" as const]
    
    variants.forEach((variant) => {
      const { unmount } = render(() => (
        <IconButton icon="test-icon" variant={variant} />
      ))

      const button = screen.getByTestId("kobalte-button")
      expect(button).toHaveAttribute("data-variant", variant)
      
      unmount()
    })
  })

  test("handles complex classList combinations", () => {
    render(() => (
      <IconButton 
        icon="test-icon"
        classList={{
          "class-1": true,
          "class-2": false,
          "class-3": true,
        }}
      />
    ))

    const button = screen.getByTestId("kobalte-button")
    expect(button).toHaveClass("class-1")
    expect(button).not.toHaveClass("class-2")
    expect(button).toHaveClass("class-3")
  })

  test("preserves accessibility attributes", () => {
    render(() => (
      <IconButton 
        icon="test-icon"
        aria-describedby="description"
        aria-expanded="true"
        role="button"
      />
    ))

    const button = screen.getByTestId("kobalte-button")
    expect(button).toHaveAttribute("aria-describedby", "description")
    expect(button).toHaveAttribute("aria-expanded", "true")
    expect(button).toHaveAttribute("role", "button")
  })

  test("handles data attributes", () => {
    render(() => (
      <IconButton 
        icon="test-icon"
        data-testid="custom-test-id"
        data-action="custom-action"
      />
    ))

    const button = screen.getByTestId("custom-test-id")
    expect(button).toHaveAttribute("data-action", "custom-action")
  })

  test("handles style prop", () => {
    render(() => (
      <IconButton 
        icon="test-icon"
        style={{ color: "red", "font-size": "16px" }}
      />
    ))

    const button = screen.getByTestId("kobalte-button")
    expect(button).toHaveStyle({ color: "red", "font-size": "16px" })
  })

  test("handles children prop (though not typically used)", () => {
    render(() => (
      <IconButton icon="test-icon">
        <span data-testid="child-content">Child Content</span>
      </IconButton>
    ))

    expect(screen.getByTestId("child-content")).toBeInTheDocument()
  })

  test("handles id prop", () => {
    render(() => (
      <IconButton icon="test-icon" id="test-button-id" />
    ))

    const button = screen.getByTestId("kobalte-button")
    expect(button).toHaveAttribute("id", "test-button-id")
  })

  test("handles title prop for tooltip", () => {
    render(() => (
      <IconButton icon="test-icon" title="Button tooltip" />
    ))

    const button = screen.getByTestId("kobalte-button")
    expect(button).toHaveAttribute("title", "Button tooltip")
  })

  test("handles form-related attributes", () => {
    render(() => (
      <IconButton 
        icon="test-icon"
        type="submit"
        form="test-form"
        name="test-button"
        value="test-value"
      />
    ))

    const button = screen.getByTestId("kobalte-button")
    expect(button).toHaveAttribute("type", "submit")
    expect(button).toHaveAttribute("form", "test-form")
    expect(button).toHaveAttribute("name", "test-button")
    expect(button).toHaveAttribute("value", "test-value")
  })

  test("handles event handlers", () => {
    const handlers = {
      onClick: mock(),
      onMouseDown: mock(),
      onMouseUp: mock(),
      onFocus: mock(),
      onBlur: mock(),
    }

    render(() => (
      <IconButton icon="test-icon" {...handlers} />
    ))

    const button = screen.getByTestId("kobalte-button")

    fireEvent.click(button)
    fireEvent.mouseDown(button)
    fireEvent.mouseUp(button)
    fireEvent.focus(button)
    fireEvent.blur(button)

    Object.values(handlers).forEach(handler => {
      expect(handler).toHaveBeenCalled()
    })
  })

  test("renders correctly with all props combined", () => {
    render(() => (
      <IconButton 
        icon="complex-icon"
        size="large"
        iconSize="normal"
        variant="primary"
        class="complex-button"
        classList={{ "featured": true, "disabled": false }}
        disabled={false}
        aria-label="Complex button"
        data-action="complex"
        style={{ margin: "8px" }}
      />
    ))

    const button = screen.getByTestId("kobalte-button")
    const icon = screen.getByTestId("icon")

    expect(button).toHaveAttribute("data-component", "icon-button")
    expect(button).toHaveAttribute("data-icon", "complex-icon")
    expect(button).toHaveAttribute("data-size", "large")
    expect(button).toHaveAttribute("data-variant", "primary")
    expect(button).toHaveClass("complex-button")
    expect(button).toHaveClass("featured")
    expect(button).not.toHaveClass("disabled")
    expect(button).toHaveAttribute("aria-label", "Complex button")
    expect(button).toHaveAttribute("data-action", "complex")
    expect(button).toHaveStyle({ margin: "8px" })

    expect(icon).toHaveAttribute("data-name", "complex-icon")
    expect(icon).toHaveAttribute("data-size", "normal")
  })
})
