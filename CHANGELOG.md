# 0.4.1
* fix a bug that breaks message acking under heavy packet loss conditions

# 0.4.0
* BREAKING: refactored the `SequenceBuffer` public API
* BREAKING: added a new paramater to `Network.readMessages` to accept a data structure to fill
* fixed all the memory leaks

# 0.3.0
* BREAKING: removed float16 polyfill. Need node 24 or later.

# 0.2.0
* BREAKING: renamed `recvMessages` to `readMessages`
* removed publicly exported but unused function `writePacket`

# 0.1.0 
* Initial commit
