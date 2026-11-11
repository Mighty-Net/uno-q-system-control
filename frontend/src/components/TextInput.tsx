import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import type {
  ChangeEvent,
  CSSProperties,
  FocusEvent,
  HTMLInputTypeAttribute,
  InputHTMLAttributes,
  KeyboardEvent,
  ReactNode,
} from 'react';
import { animated, useSpring } from '@react-spring/web';
import styled from 'styled-components';

type ThemeMode = 'dark' | 'light' | string;

export type TextInputRef = HTMLInputElement & {
  showHint: () => void;
  hideHint: () => void;
  setError: (status: boolean) => void;
};

type TextInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  | 'children'
  | 'onBlur'
  | 'onChange'
  | 'onFocus'
  | 'onInput'
  | 'onKeyDown'
  | 'style'
  | 'type'
  | 'value'
> & {
  hintMsg?: ReactNode;
  style?: CSSProperties;
  textStyle?: CSSProperties;
  themeMode?: ThemeMode;
  type?: HTMLInputTypeAttribute;
  value?: string | number;
  onBlur?: (event: FocusEvent<HTMLInputElement>) => void;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  onEnter?: (value: string, event: KeyboardEvent<HTMLInputElement>) => void;
  onFocus?: (event: FocusEvent<HTMLInputElement>) => void;
  onInput?: (
    value: string,
    target: HTMLInputElement,
    event: ChangeEvent<HTMLInputElement>,
  ) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
};

const Input = styled.input<{ $themeMode: ThemeMode }>`
  height: 40px;
  width: 100%;
  min-width: 110px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  background-color: ${(props) => (props.$themeMode === 'dark' ? '#222e33' : '#fff')};
  border-radius: 6px;
  font-family: 'Noto Sans TC', sans-serif;
  font-weight: 300;
  padding: 2px 10px;
  border: 2px solid #dce5f0;
  
  box-shadow:
  0 2px 6px rgba(30, 58, 95, 0.06),
  0 1px 3px rgba(30, 58, 95, 0.04);

  transition:
    border-color 0.3s ease,
    box-shadow 0.3s ease;

  &:focus {
    outline: none;
    border-color: #43a0b0;

    box-shadow:
      0 0 0 3px rgba(67, 160, 176, 0.12),
      0 2px 8px rgba(67, 160, 176, 0.15);
  }

  &.error {
    border-color: #ef4444;

    box-shadow:
      0 0 0 3px rgba(239, 68, 68, 0.10),
      0 2px 8px rgba(239, 68, 68, 0.12);
  }

  &.error:focus {
    border-color: #dc2626;

    box-shadow:
      0 0 0 3px rgba(220, 38, 38, 0.16),
      0 2px 8px rgba(220, 38, 38, 0.18);
  }
`;

const ErrorView = styled.div`
  position: absolute;
  width: fit-content;
  background-color: #222;
  padding: 0 10px;
  height: 30px;
  top: 32px;
  right: 7px;
  border-radius: 4px;
  color: #fff;
  -webkit-box-shadow: 2px 2px 4px -2px #fff;
  box-shadow: 2px 2px 4px -2px #fff;
  font-size: 16px;

  &:after {
    content: '';
    border-top: 6px solid transparent;
    position: absolute;
    border-bottom: 6px solid #222;
    border-left: 6px solid transparent;
    border-right: 6px solid transparent;
    left: 1px;
    top: -11px;
  }
`;

const AnimatedErrorView = animated(ErrorView);

const TextInput = forwardRef<TextInputRef, TextInputProps>(
  (
    {
      className = '',
      hintMsg,
      maxLength,
      name,
      onBlur,
      onChange,
      onEnter,
      onFocus,
      onInput,
      onKeyDown,
      pattern,
      placeholder,
      readOnly = false,
      style,
      textStyle,
      themeMode = 'light',
      type = 'text',
      value = '',
      ...props
    },
    ref,
  ) => {
    const [hintVisible, setHintVisible] = React.useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const animatedStyles = useSpring({
      opacity: hintVisible ? 1 : 0,
      config: {
        duration: 100,
      },
    });

    const showHint = () => {
      setHintVisible(true);
    };

    const hideHint = () => {
      setHintVisible(false);
    };

    const setError = (status: boolean) => {
      inputRef.current?.classList.toggle('error', status);
    };

    useImperativeHandle(
      ref,
      () => {
        return Object.assign(inputRef.current!, {
          showHint,
          hideHint,
          setError,
        });
      },
      [],
    );

    const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
      const target = event.currentTarget;

      if (pattern && !target.validity.valid) {
        return;
      }

      onChange?.(event);
      onInput?.(target.value, target, event);
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
      onKeyDown?.(event);

      if (!event.defaultPrevented && event.key === 'Enter') {
        onEnter?.(event.currentTarget.value, event);
      }
    };

    return (
      <div style={{ position: 'relative', ...style }}>
        <Input
          {...props}
          ref={inputRef}
          $themeMode={themeMode}
          className={`fieldValue ${className}`}
          style={textStyle}
          value={value}
          placeholder={placeholder}
          maxLength={maxLength}
          name={name}
          readOnly={readOnly}
          type={type}
          pattern={pattern}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={(event) => {
            hideHint();
            onFocus?.(event);
          }}
          onBlur={(event) => {
            onBlur?.(event);
          }}
        />
        {hintMsg && hintVisible ? (
          <AnimatedErrorView style={animatedStyles} className="text-sm flex items-center">
            {hintMsg}
          </AnimatedErrorView>
        ) : null}
      </div>
    );
  },
);

TextInput.displayName = 'TextInput';

export default TextInput;
