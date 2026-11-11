import { forwardRef } from 'react';
import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import styled from 'styled-components';

type ActButtonProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  text?: string;
  children?: ReactNode;
  style?: CSSProperties;
  isDisable?:boolean
};

const Container = styled.div<{$disable:boolean}>`
  cursor:${props=>props.$disable?"default":"pointer"};
  padding: 5px;
  background-color:${props=>props.$disable?"rgba(0,0,0,0.3)":"#7c96a8"};
  box-shadow: 2px 2px 4px -1px rgba(155, 155, 155, 0.9);
  border: 1px solid;
  border-radius: 6px;
  min-height: 40px;
  min-width: 80px;
  color: #fff;

  &:hover {
    background-color:${props=>props.$disable?"rgba(0,0,0,0.3)":"#3f8c8c"};
  }
`;

const ActButton = forwardRef<HTMLDivElement, ActButtonProps>(
  ({ className = '', style, text,isDisable=false, children, onClick, ...props }, ref) => {
    return (
      <Container
        {...props}
        ref={ref}
        className={`whitespace-nowrap flex-none flex select-none justify-center items-center self-start ${className}`}
        style={style}
        $disable={isDisable}
        onClick={(e)=>{if(isDisable)return;onClick?.(e)}}
      >
        {children ?? text}
      </Container>
    );
  },
);

ActButton.displayName = 'ActButton';

export default ActButton;
