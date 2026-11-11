import React, { useEffect, forwardRef } from 'react';
import { createGlobalStyle } from 'styled-components';
import { Toast } from 'primereact/toast';


const GlobalStyle = createGlobalStyle
`
.p-toast-message {
  backdrop-filter: blur(10px);
}
.p-toast .p-toast-message {
  margin: 0 0 1rem 0;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
  border-radius: 6px;
}
.p-toast .p-toast-message .p-toast-message-content {
  padding: 1rem;
}
.p-toast-message-content {
  display: flex;
  align-items: flex-start;
  color:#fff;
  & *{color:#fff;}
}
.p-toast .p-toast-message .p-toast-message-content .p-toast-message-text {
  margin: 0 0 0 1rem;
}
.p-toast-message-text {
  flex: 1 1 auto;
}
.p-toast .p-toast-message .p-toast-message-content .p-toast-message-icon.p-icon {
  width: 2rem;
  height: 2rem;
  align-self: anchor-center;
}
.p-toast .p-toast-message .p-toast-icon-close {
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  background: transparent;
  transition: background-color 0.2s, color 0.2s, box-shadow 0.2s;
}
.p-toast-icon-close.p-link,.p-toast-icon-close.p-link * {
  cursor: pointer;
}
.p-toast .p-toast-message .p-toast-icon-close:hover {
  background: rgba(255, 255, 255, 0.5);
}
.p-toast .p-toast-message .p-toast-message-content .p-toast-detail {
  margin: 0.5rem 0 0 0;
}
.p-toast-summary{
  -webkit-user-select: none;
  -moz-user-select: none;
  user-select: none;
  font-weight:400;
}
.p-toast-detail {
  -webkit-user-select: none;
  -moz-user-select: none;
  user-select: none;
  overflow-wrap: anywhere;font-weight:400;
}

.p-toast .p-toast-message.p-toast-message-success {
  background: rgba(50, 50, 50, 0.7);
  border: solid #1ea97c;
  border-width: 0 0 0 6px;
  color: #1ea97c;
}
.p-toast .p-toast-message.p-toast-message-info {
  background: rgba(50, 50, 50, 0.7);
  border: solid #3b82f6;
  border-width: 0 0 0 6px;
  color: #3b82f6;
}
.p-toast .p-toast-message.p-toast-message-error {
  background: rgba(50, 50, 50, 0.7);
  border: solid #ff5757;
  border-width: 0 0 0 6px;
  color: #ff5757;
}
.p-toast .p-toast-message.p-toast-message-warn {
  background: rgba(50, 50, 50, 0.7);
  border: solid #d8b279;
  border-width: 0 0 0 6px;
  color: #d8b279;
}
`
type MsgToastProps = {};
export type { Toast as TypeToast } from 'primereact/toast';
export const MsgToast = forwardRef<Toast, MsgToastProps>((_props, ref) => {
  useEffect(() => {
    return () => {
      // unsubscribe
    } 
  },[]);
  return (
    <React.Fragment>
      <GlobalStyle/>
      <Toast position="top-center" ref={ref} appendTo={document.getElementById('appContent')} baseZIndex={99999}/>
    </React.Fragment>
  );
});